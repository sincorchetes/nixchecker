export type TokenKind = "ident" | "string" | "number" | "path" | "punct";

export interface Token {
  kind: TokenKind;
  text: string;
  line: number;
  col: number;
  /** Where the token ends (the position right after its last character). */
  endLine: number;
  endCol: number;
  /** Strings: the text, when it has no `${...}`; undefined otherwise. */
  value?: string;
  /** Numbers: written with a fraction or exponent. */
  float?: boolean;
}

export interface LexError {
  code: "syntax-unterminated-string" | "syntax-unterminated-comment";
  line: number;
  col: number;
}

const NAME = "[A-Za-z0-9._+-]";
const IDENT = /[A-Za-z_][A-Za-z0-9_'-]*/y;
const PATH = new RegExp(`${NAME}*(?:/${NAME}+)+/?`, "y");
const HOME_PATH = new RegExp(`~(?:/${NAME}+)+/?`, "y");
const SEARCH_PATH = new RegExp(`<${NAME}+(?:/${NAME}+)*>`, "y");
const URI = /[A-Za-z][A-Za-z0-9+.-]*:[A-Za-z0-9%/?:@&=+$,\-_.!~*']+/y;
const FLOAT = /(?:[1-9][0-9]*\.[0-9]*|0?\.[0-9]+)(?:[Ee][+-]?[0-9]+)?/y;
const INT = /[0-9]+/y;
// A path that goes on with `${...}`: `./patches/${version}/x.patch`.
const PATH_BEFORE_INTERPOLATION = new RegExp(`${NAME}*(?:/${NAME}+)*/(?=\\$\\{)`, "y");
const PATH_REST = /[A-Za-z0-9._+\-/]*/y;
const OPERATORS = ["...", "++", "//", "->", "==", "!=", "<=", ">=", "&&", "||", "${"];

// What a string reader returns: its text (undefined with an interpolation) and whether it closed.
interface Text {
  value: string | undefined;
  closed: boolean;
}

const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r" };

/** Splits Nix source into tokens, dropping whitespace and comments. */
export function lex(src: string): { tokens: Token[]; errors: LexError[] } {
  const tokens: Token[] = [];
  const errors: LexError[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const step = (count = 1) => {
    for (let n = 0; n < count; n++) {
      if (src[i] === "\n") {
        line++;
        col = 1;
      } else {
        col++;
      }
      i++;
    }
  };

  const longest = (patterns: RegExp[]): string | undefined => {
    let best: string | undefined;
    for (const re of patterns) {
      re.lastIndex = i;
      const found = re.exec(src)?.[0];
      if (found && found.length > (best?.length ?? 0)) best = found;
    }
    return best;
  };

  // Skips a `${ ... }`, which may hold nested strings and braces. `i` points at the `$`.
  const skipInterpolation = () => {
    step(2);
    let depth = 1;
    while (i < src.length && depth > 0) {
      if (src[i] === '"') {
        skipQuoted();
      } else if (src.startsWith("''", i)) {
        skipIndented();
      } else if (src[i] === "#") {
        while (i < src.length && src[i] !== "\n") step();
      } else if (src.startsWith("/*", i)) {
        const close = src.indexOf("*/", i + 2);
        step(close < 0 ? src.length - i : close + 2 - i);
      } else {
        if (src[i] === "{") depth++;
        if (src[i] === "}") depth--;
        step();
      }
    }
  };

  // Both readers assume `i` is at the opening quote(s) and return the text between, or
  // undefined when it has an interpolation; false in `closed` when the input ended first.
  const skipQuoted = (): Text => {
    step();
    let value: string | undefined = "";
    while (i < src.length && src[i] !== '"') {
      if (src[i] === "\\") {
        step();
        const next = src[i] ?? "";
        if (value !== undefined) value += ESCAPES[next] ?? next;
        step();
      } else if (src.startsWith("${", i)) {
        value = undefined;
        skipInterpolation();
      } else {
        if (value !== undefined) value += src[i];
        step();
      }
    }
    const closed = i < src.length;
    if (closed) step();
    return { value, closed };
  };

  const skipIndented = (): Text => {
    step(2);
    let value: string | undefined = "";
    while (i < src.length) {
      if (src.startsWith("''\\", i)) {
        step(4); // `''\n` and friends: the escape takes the next character too
      } else if (src.startsWith("'''", i) || src.startsWith("''$", i)) {
        step(3);
      } else if (src.startsWith("''", i)) {
        step(2);
        return { value, closed: true };
      } else if (src.startsWith("${", i)) {
        value = undefined;
        skipInterpolation();
      } else {
        if (value !== undefined) value += src[i];
        step();
      }
    }
    return { value, closed: false };
  };

  while (i < src.length) {
    const ch = src[i] as string;
    const at = { line, col };
    const push = (token: Omit<Token, "line" | "col" | "endLine" | "endCol">) =>
      tokens.push({ ...token, ...at, endLine: line, endCol: col });

    if (/\s/.test(ch)) {
      step();
    } else if (ch === "#") {
      while (i < src.length && src[i] !== "\n") step();
    } else if (src.startsWith("/*", i)) {
      step(2);
      while (i < src.length && !src.startsWith("*/", i)) step();
      if (i >= src.length) errors.push({ code: "syntax-unterminated-comment", ...at });
      else step(2);
    } else if (ch === '"' || src.startsWith("''", i)) {
      const { value, closed } = ch === '"' ? skipQuoted() : skipIndented();
      if (closed)
        push({ kind: "string", text: value ?? "", ...(value !== undefined && { value }) });
      else errors.push({ code: "syntax-unterminated-string", ...at });
    } else {
      // The longest of path, URI, number and identifier wins, as in Nix's own lexer.
      let text = longest([
        PATH,
        PATH_BEFORE_INTERPOLATION,
        HOME_PATH,
        SEARCH_PATH,
        URI,
        FLOAT,
        INT,
        IDENT,
      ]);
      if (text === undefined) {
        const op = OPERATORS.find((o) => src.startsWith(o, i)) ?? ch;
        step(op.length);
        push({ kind: "punct", text: op });
      } else {
        step(text.length);
        let whole = text;
        const startsPath = text.startsWith("<") || (text.includes("/") && !text.includes(":"));
        while (startsPath && src.startsWith("${", i)) {
          skipInterpolation();
          PATH_REST.lastIndex = i;
          const rest = PATH_REST.exec(src)?.[0] ?? "";
          step(rest.length);
          whole += `\${…}${rest}`;
        }
        text = whole;
        const isPath = text.startsWith("<") || (text.includes("/") && !text.includes(":"));
        if (isPath) push({ kind: "path", text });
        else if (/^[A-Za-z_]/.test(text) && !text.includes(":")) push({ kind: "ident", text });
        else if (/^[0-9.]/.test(text)) push({ kind: "number", text, float: /[.eE]/.test(text) });
        else push({ kind: "path", text }); // a URI such as `https://example.org`
      }
    }
  }
  return { tokens, errors };
}
