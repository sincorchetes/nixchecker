import type { Token } from "./tokenize";

export type ValueKind = "bool" | "str" | "int" | "list" | "attrs" | "other";

export interface Assignment {
  /** Full attribute path, e.g. ["services", "openssh", "enable"]. */
  path: string[];
  line: number;
  col: number;
  kind: ValueKind;
  /** Raw content of a plain string value, used to check enums. */
  value?: string;
  /** Set when the value is a lone name (`a = foo;`): where it is, to check it is defined. */
  ref?: { name: string; line: number; col: number };
}

const isPunct = (token: Token | undefined, text: string) =>
  token?.kind === "punct" && token.text === text;
const isWord = (token: Token | undefined, text: string) =>
  token?.kind === "ident" && token.text === text;

/**
 * Walks the root attribute set of a module and returns every `a.b.c = value;`
 * with its full path. Only sets reached through a direct `path = { ... };` are
 * descended into: function bodies, `mkIf`, lists and `let` bindings stay opaque
 * on purpose, so the checker never reports what it cannot be sure about.
 */
export interface ScanProblem {
  /** `incomplete`: `a.b` with no `=`. `unterminated`: `a.b = v` with no `;`. */
  kind: "incomplete" | "unterminated";
  path: string[];
  line: number;
  col: number;
}

export function scan(
  tokens: Token[],
  report: (problem: ScanProblem) => void = () => {},
): Assignment[] {
  const out: Assignment[] = [];
  let pos = 0;

  // Index of the `}` matching the `{` at `open` (tokens.length if unclosed).
  const matchClose = (open: number): number => {
    let depth = 0;
    for (let n = open; n < tokens.length; n++) {
      if (isPunct(tokens[n], "{")) depth++;
      if (isPunct(tokens[n], "}") && --depth === 0) return n;
    }
    return tokens.length;
  };

  // Moves `pos` past the `in` that closes the `let` just consumed.
  const skipLet = () => {
    let depth = 1;
    while (pos < tokens.length && depth > 0) {
      if (isWord(tokens[pos], "let")) depth++;
      if (isWord(tokens[pos], "in")) depth--;
      pos++;
    }
  };

  // Does an `a.b = ...` begin at `at`, on a new line right after a finished expression? Then the
  // statement before it lost its `;`.
  const startsAssignment = (at: number): boolean => {
    const prev = tokens[at - 1];
    const first = tokens[at];
    if (!prev || !first || first.line === prev.line) return false;
    const endsExpression =
      prev.kind !== "punct" || prev.text === ")" || prev.text === "]" || prev.text === "}";
    let n = at;
    while (n + 2 < tokens.length && tokens[n]?.kind !== "punct" && isPunct(tokens[n + 1], "."))
      n += 2;
    const name = tokens[n];
    return (
      endsExpression &&
      (name?.kind === "ident" || name?.kind === "string") &&
      isPunct(tokens[n + 1], "=") &&
      !isPunct(tokens[n + 2], "=")
    );
  };

  // Moves `pos` past the next `;` outside brackets; stops before a `}` that
  // closes the enclosing set (a statement missing its `;`).
  const skipStatement = (): boolean => {
    let depth = 0;
    while (pos < tokens.length) {
      if (depth === 0 && startsAssignment(pos)) return false;
      const token = tokens[pos++] as Token;
      if (isWord(token, "let")) {
        skipLet();
        continue;
      }
      if (token.kind !== "punct") continue;
      if ("{[(".includes(token.text)) {
        depth++;
      } else if ("}])".includes(token.text)) {
        if (depth === 0 && token.text === "}") {
          pos--;
          return false;
        }
        depth = Math.max(0, depth - 1);
      } else if (token.text === ";" && depth === 0) {
        return true;
      }
    }
    return false;
  };

  // Reads `a."b".${c}` and returns its segments, or undefined if there is none.
  const readAttrPath = (): string[] | undefined => {
    const segments: string[] = [];
    for (;;) {
      const token = tokens[pos];
      if (token?.kind === "ident") segments.push(token.text);
      else if (token?.kind === "string") segments.push(token.interpolated ? "*" : token.text);
      else return undefined;
      pos++;
      if (!isPunct(tokens[pos], ".")) return segments;
      pos++;
    }
  };

  // Does the expression starting at `at` have one of the operators that always yield a boolean at
  // its top level (`!`, `&&`, `||`, `==`, `!=`)? Not when `if`, `let`, `with` or a lambda could hide it.
  const isBoolean = (at: number): boolean => {
    if (isPunct(tokens[at], "!") && !isPunct(tokens[at + 1], "=")) return true;
    let depth = 0;
    let found = false;
    for (let n = at; n < tokens.length; n++) {
      const token = tokens[n] as Token;
      if (
        token.kind === "ident" &&
        ["if", "let", "with", "assert", "inherit"].includes(token.text)
      ) {
        return false;
      }
      if (token.kind !== "punct") continue;
      if ("{[(".includes(token.text)) depth++;
      else if ("}])".includes(token.text)) {
        if (depth === 0) break;
        depth--;
      } else if (depth === 0) {
        if (token.text === ";") break;
        if (token.text === ":") return false;
        const next = tokens[n + 1]?.text;
        const pair = token.text + (next ?? "");
        if (["&&", "||", "==", "!="].includes(pair) && isPunct(tokens[n + 1], pair[1] as string)) {
          found = true;
        }
      }
    }
    return found;
  };

  // `mkDefault x` and the like give the option the type of `x`: look through them.
  const WRAPPERS = ["mkDefault", "mkForce", "mkOverride"];
  const unwrap = (at: number): number => {
    const lib = isWord(tokens[at], "lib") && isPunct(tokens[at + 1], ".");
    const name = tokens[at + (lib ? 2 : 0)];
    if (name?.kind !== "ident" || !WRAPPERS.includes(name.text)) return at;
    const after = at + (lib ? 3 : 1);
    // `mkOverride 50 x` takes a priority first.
    return unwrap(
      name.text === "mkOverride" && tokens[after]?.kind === "number" ? after + 1 : after,
    );
  };

  const scalar = (from = pos): Pick<Assignment, "kind" | "value" | "ref"> => {
    const at = unwrap(from);
    const first = tokens[at] as Token | undefined;
    const alone = isPunct(tokens[at + 1], ";") || isPunct(tokens[at + 1], "}");
    if (isBoolean(at)) return { kind: "bool" };
    if (first?.kind === "string" && alone && first.interpolated) return { kind: "str" };
    if (first?.kind === "ident" && alone && (first.text === "true" || first.text === "false")) {
      return { kind: "bool" };
    }
    if (first?.kind === "string" && alone && !first.interpolated) {
      return { kind: "str", value: first.text };
    }
    if (first?.kind === "number" && alone && !first.text.includes(".")) return { kind: "int" };
    if (isPunct(first, "[")) return { kind: "list" };
    if (first?.kind === "ident" && alone) {
      return { kind: "other", ref: { name: first.text, line: first.line, col: first.col } };
    }
    return { kind: "other" };
  };

  const scanSet = (prefix: string[]) => {
    pos++; // `{`
    while (pos < tokens.length && !isPunct(tokens[pos], "}")) {
      const start = tokens[pos] as Token;
      if (isWord(start, "inherit")) {
        skipStatement();
        continue;
      }
      const segments = readAttrPath();
      if (segments && !isPunct(tokens[pos], "=")) {
        report({ kind: "incomplete", path: segments, line: start.line, col: start.col });
      }
      if (!segments || !isPunct(tokens[pos], "=")) {
        skipStatement();
        continue;
      }
      pos++; // `=`
      const path = [...prefix, ...segments];
      const at = { line: start.line, col: start.col };
      if (isPunct(tokens[pos], "{")) {
        const close = matchClose(pos);
        if (isPunct(tokens[close + 1], ";")) {
          out.push({ path, kind: "attrs", ...at });
          scanSet(path);
          pos++; // `;`
          continue;
        }
      }
      out.push({ path, ...scalar(), ...at });
      if (!skipStatement()) report({ kind: "unterminated", path, ...at });
    }
    pos++; // `}`
  };

  while (pos < tokens.length) {
    const token = tokens[pos] as Token;
    if (isWord(token, "let")) {
      pos++;
      skipLet();
    } else if (isPunct(token, "{")) {
      const close = matchClose(pos);
      if (isPunct(tokens[close + 1], ":")) {
        pos = close + 2; // function argument pattern
      } else {
        scanSet([]);
        break;
      }
    } else {
      pos++;
    }
  }
  return out;
}
