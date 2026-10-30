export type TokenKind = "ident" | "string" | "number" | "punct";

export interface Token {
  kind: TokenKind;
  text: string;
  line: number;
  col: number;
  /** Strings only: true when the literal contains `${...}`. */
  interpolated?: boolean;
}

export interface LexError {
  code: "syntax-unterminated-string" | "syntax-unterminated-comment";
  line: number;
  col: number;
}

const IDENT = /[A-Za-z_][A-Za-z0-9_'-]*/y;
const NUMBER = /[0-9]+(?:\.[0-9]+)?/y;

/** Splits Nix source into tokens, dropping whitespace and comments. */
export function tokenize(src: string): { tokens: Token[]; errors: LexError[] } {
  const tokens: Token[] = [];
  const errors: LexError[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const step = () => {
    if (src[i] === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
    i++;
  };

  // Skips a `${ ... }` interpolation, assuming `i` points at the `$`.
  const skipInterpolation = () => {
    step(); // `$`
    let depth = 0;
    do {
      if (src[i] === "{") depth++;
      if (src[i] === "}") depth--;
      step();
    } while (depth > 0 && i < src.length);
  };

  const match = (re: RegExp): string | undefined => {
    re.lastIndex = i;
    return re.exec(src)?.[0];
  };

  while (i < src.length) {
    const ch = src[i] as string;
    const at = { line, col };

    if (/\s/.test(ch)) {
      step();
    } else if (ch === "#") {
      while (i < src.length && src[i] !== "\n") step();
    } else if (src.startsWith("/*", i)) {
      step();
      step();
      while (i < src.length && !src.startsWith("*/", i)) step();
      if (i >= src.length) {
        errors.push({ code: "syntax-unterminated-comment", ...at });
      } else {
        step();
        step();
      }
    } else if (ch === '"') {
      step();
      const from = i;
      let interpolated = false;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\\") {
          step();
          step();
        } else if (src.startsWith("${", i)) {
          interpolated = true;
          skipInterpolation();
        } else {
          step();
        }
      }
      if (i >= src.length) {
        errors.push({ code: "syntax-unterminated-string", ...at });
      } else {
        tokens.push({ kind: "string", text: src.slice(from, i), interpolated, ...at });
        step();
      }
    } else if (src.startsWith("${", i)) {
      // Dynamic attribute name, e.g. `services.${name}.enable`.
      const from = i;
      skipInterpolation();
      tokens.push({ kind: "string", text: src.slice(from, i), interpolated: true, ...at });
    } else if (src.startsWith("''", i)) {
      step();
      step();
      const from = i;
      let interpolated = false;
      let closed = false;
      while (i < src.length && !closed) {
        if (src.startsWith("'''", i) || src.startsWith("''$", i) || src.startsWith("''\\", i)) {
          step();
          step();
          step();
        } else if (src.startsWith("''", i)) {
          closed = true;
        } else if (src.startsWith("${", i)) {
          interpolated = true;
          skipInterpolation();
        } else {
          step();
        }
      }
      if (closed) {
        tokens.push({ kind: "string", text: src.slice(from, i), interpolated, ...at });
        step();
        step();
      } else {
        errors.push({ code: "syntax-unterminated-string", ...at });
      }
    } else {
      const word = match(IDENT);
      const digits = word === undefined ? match(NUMBER) : undefined;
      const text = word ?? digits ?? ch;
      tokens.push({ kind: word ? "ident" : digits ? "number" : "punct", text, ...at });
      for (let n = 0; n < text.length; n++) step();
    }
  }
  return { tokens, errors };
}
