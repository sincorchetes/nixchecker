import type { AttrPart, Bind, Expr, Param, Pos } from "./ast";
import { type LexError, lex, type Token } from "./lex";

/** A syntax problem; `code` names the message `diag.<code>` and `params` fills its placeholders. */
export interface Problem extends Pos {
  code:
    | LexError["code"]
    | "syntax-expected"
    | "syntax-expected-eof"
    | "syntax-unexpected"
    | "syntax-unexpected-eof"
    | "syntax-unbalanced"
    | "syntax-unclosed"
    | "syntax-incomplete"
    | "syntax-unterminated";
  params: Record<string, string>;
}

const KEYWORDS = new Set(["if", "then", "else", "assert", "with", "let", "in", "rec", "inherit"]);
const CLOSERS = new Set(["}", ")", "]"]);
// Binary operators: [precedence, right associative]. Higher binds tighter.
const BINARY: Record<string, [number, boolean]> = {
  "->": [0, true],
  "||": [1, false],
  "&&": [2, false],
  "==": [3, false],
  "!=": [3, false],
  "<": [4, false],
  "<=": [4, false],
  ">": [4, false],
  ">=": [4, false],
  "//": [5, true],
  "+": [7, false],
  "-": [7, false],
  "*": [8, false],
  "/": [8, false],
  "++": [9, true],
};

const posOf = ({ line, col }: Pos): Pos => ({ line, col });

/** Thrown after a problem is recorded, to unwind to where parsing can resume. */
class Bail extends Error {}

class Parser {
  i = 0;
  readonly problems: Problem[] = [];
  constructor(private readonly toks: Token[]) {}

  private get tok(): Token | undefined {
    return this.toks[this.i];
  }
  private peek(n = 1): Token | undefined {
    return this.toks[this.i + n];
  }
  private isP(text: string, t = this.tok): boolean {
    return t?.kind === "punct" && t.text === text;
  }
  private isK(word: string, t = this.tok): boolean {
    return t?.kind === "ident" && t.text === word;
  }
  private next(): Token {
    return this.toks[this.i++] as Token;
  }
  private fail(problem: Problem): never {
    this.problems.push(problem);
    throw new Bail();
  }
  private at(t: Token): Pos {
    return { line: t.line, col: t.col };
  }
  private shown(t: Token): string {
    return t.kind === "string" ? '"…"' : t.text;
  }

  // The problem for a token that cannot be where it is.
  private unexpected(): never {
    const t = this.tok;
    if (!t) this.fail({ code: "syntax-unexpected-eof", params: {}, ...this.end() });
    const closer = t.kind === "punct" && CLOSERS.has(t.text);
    return this.fail(
      closer
        ? { code: "syntax-unbalanced", params: { char: t.text }, ...this.at(t) }
        : { code: "syntax-unexpected", params: { found: this.shown(t) }, ...this.at(t) },
    );
  }

  // Where the last token ends: the place to point at when the file stops short.
  private end(): Pos {
    const last = this.toks[this.toks.length - 1];
    return last ? { line: last.endLine, col: last.endCol } : { line: 1, col: 1 };
  }

  private expectP(text: string, opener?: Token): Token {
    const t = this.tok;
    if (t && this.isP(text)) return this.next();
    if (!t && opener) {
      this.fail({ code: "syntax-unclosed", params: { char: opener.text }, ...this.at(opener) });
    }
    if (!t) this.fail({ code: "syntax-expected-eof", params: { expected: text }, ...this.end() });
    return this.fail({
      code: "syntax-expected",
      params: { expected: text, found: this.shown(t) },
      ...this.at(t),
    });
  }

  private expectK(word: string): void {
    const t = this.tok;
    if (t && this.isK(word)) {
      this.next();
      return;
    }
    if (!t) this.fail({ code: "syntax-expected-eof", params: { expected: word }, ...this.end() });
    this.fail({
      code: "syntax-expected",
      params: { expected: word, found: this.shown(t) },
      ...this.at(t),
    });
  }

  // The `;` that ends a binding. A missing one is reported and parsing goes on as if it were
  // there when what follows can start another binding or ends the set.
  private semicolon(label: string): void {
    if (this.isP(";")) {
      this.next();
      return;
    }
    const t = this.tok;
    if (!t) return; // the end of the file: whoever opened the bracket reports it
    const prev = this.toks[this.i - 1];
    const continues =
      this.isP("}") ||
      this.isK("in") ||
      t.kind === "ident" ||
      t.kind === "string" ||
      this.isP("${");
    if (continues && prev) {
      this.problems.push({
        code: "syntax-unterminated",
        params: { path: label },
        line: prev.endLine,
        col: prev.endCol,
      });
      return;
    }
    this.expectP(";");
  }

  parseProgram(): Expr | undefined {
    try {
      const expr = this.expr();
      if (this.tok) this.unexpected();
      return expr;
    } catch {
      return undefined; // a problem was recorded where it happened
    }
  }

  // ---- expressions ----------------------------------------------------------------------

  private expr(): Expr {
    const t = this.tok;
    if (!t) return this.unexpected();
    const pos = this.at(t);
    if (t.kind === "ident") {
      if (t.text === "let") return this.letIn(pos);
      if (t.text === "with" || t.text === "assert") {
        this.next();
        const head = this.expr();
        this.expectP(";");
        const body = this.expr();
        return t.text === "with"
          ? { t: "with", env: head, body, ...pos }
          : { t: "assert", cond: head, body, ...pos };
      }
      if (t.text === "if") {
        this.next();
        const cond = this.expr();
        this.expectK("then");
        const then = this.expr();
        this.expectK("else");
        return { t: "if", cond, then, else: this.expr(), ...pos };
      }
      if (!KEYWORDS.has(t.text) && (this.isP(":", this.peek()) || this.isP("@", this.peek()))) {
        return this.lambda(pos);
      }
    }
    if (this.isP("{") && this.startsFormals()) return this.lambda(pos);
    return this.binary(0);
  }

  // Does the `{` at the cursor open a function's argument set (`{ a, b }:`) and not an attribute set?
  private startsFormals(): boolean {
    let depth = 0;
    for (let n = this.i; n < this.toks.length; n++) {
      const t = this.toks[n] as Token;
      if (this.isP("{", t) || this.isP("${", t)) depth++;
      if (this.isP("}", t) && --depth === 0) {
        const after = this.toks[n + 1];
        return this.isP(":", after) || this.isP("@", after);
      }
    }
    return false;
  }

  private lambda(pos: Pos): Expr {
    let param: Param;
    let alias: string | undefined;
    if (this.tok?.kind === "ident") {
      const name = this.next().text;
      if (this.isP(":")) {
        this.next();
        return { t: "lambda", param: { kind: "ident", name }, body: this.expr(), ...pos };
      }
      this.expectP("@");
      alias = name;
    }
    const open = this.expectP("{");
    const names: string[] = [];
    while (this.tok && !this.isP("}")) {
      if (this.isP("...")) {
        this.next();
      } else {
        const t = this.tok;
        if (t.kind !== "ident") this.unexpected();
        names.push(this.next().text);
        if (this.isP("?")) {
          this.next();
          this.expr();
        }
      }
      if (this.isP(",")) this.next();
      else if (!this.isP("}")) {
        if (!this.tok) break;
        this.expectP(",");
      }
    }
    this.expectP("}", open);
    if (this.isP("@")) {
      this.next();
      const t = this.tok;
      if (t?.kind !== "ident") this.unexpected();
      alias = this.next().text;
    }
    this.expectP(":");
    param = { kind: "formals", names, ...(alias && { alias }) };
    return { t: "lambda", param, body: this.expr(), ...pos };
  }

  private letIn(pos: Pos): Expr {
    this.next();
    const binds = this.binds("in");
    this.expectK("in");
    return { t: "let", binds, body: this.expr(), ...pos };
  }

  private binary(min: number): Expr {
    let left: Expr;
    const t = this.tok;
    if (t && this.isP("!")) {
      this.next();
      left = { t: "unary", op: "!", arg: this.binary(7), ...this.at(t) };
    } else {
      left = this.hasAttr();
    }
    for (;;) {
      const op = this.tok;
      const entry = op?.kind === "punct" ? BINARY[op.text] : undefined;
      if (!op || !entry || entry[0] < min) return left;
      this.next();
      const right = this.binary(entry[1] ? entry[0] : entry[0] + 1);
      left = { t: "binary", op: op.text, left, right, ...this.at(op) };
    }
  }

  private hasAttr(): Expr {
    let base = this.negate();
    while (this.isP("?")) {
      this.next();
      base = { t: "hasattr", base, path: this.attrPath(), ...posOf(base) };
    }
    return base;
  }

  private negate(): Expr {
    const t = this.tok;
    if (t && this.isP("-")) {
      this.next();
      return { t: "unary", op: "-", arg: this.negate(), ...this.at(t) };
    }
    return this.application();
  }

  // Does `name = ...` (or `a.b = ...`) begin at `at`? An argument can never be followed by `=`, so
  // this is the next binding and not another argument: the `;` before it was forgotten.
  private startsBinding(at: number): boolean {
    let n = at;
    while (this.isP(".", this.toks[n + 1])) n += 2;
    const name = this.toks[n];
    return (name?.kind === "ident" || name?.kind === "string") && this.isP("=", this.toks[n + 1]);
  }

  private canStartArgument(): boolean {
    const t = this.tok;
    if (!t) return false;
    if ((t.kind === "ident" || t.kind === "string") && this.startsBinding(this.i)) return false;
    if (t.kind === "ident") return !KEYWORDS.has(t.text) || t.text === "rec";
    if (t.kind === "punct") return ["(", "[", "{"].includes(t.text);
    return true;
  }

  private application(): Expr {
    let fn = this.select();
    while (this.canStartArgument()) {
      const arg = this.select();
      fn = { t: "app", fn, arg, ...posOf(fn) };
    }
    return fn;
  }

  private select(): Expr {
    const base = this.atom();
    if (!this.isP(".")) return base;
    this.next();
    const path = this.attrPath();
    let fallback: Expr | undefined;
    if (this.isK("or")) {
      this.next();
      fallback = this.select();
    }
    return { t: "select", base, path, ...(fallback && { fallback }), ...posOf(base) };
  }

  private atom(): Expr {
    const t = this.tok;
    if (!t) return this.unexpected();
    const pos = this.at(t);
    switch (t.kind) {
      case "number":
        this.next();
        return { t: "num", float: t.float === true, ...pos };
      case "string":
        this.next();
        return { t: "str", ...(t.value !== undefined && { value: t.value }), ...pos };
      case "path":
        this.next();
        return { t: "path", ...pos };
      case "ident":
        if (t.text === "rec" && this.isP("{", this.peek())) {
          this.next();
          return this.set(true, pos);
        }
        if (KEYWORDS.has(t.text)) return this.unexpected();
        this.next();
        return { t: "ident", name: t.text, ...pos };
      default:
        break;
    }
    if (this.isP("(")) {
      this.next();
      const inner = this.expr();
      this.expectP(")", t);
      return { t: "paren", inner, ...pos };
    }
    if (this.isP("[")) {
      this.next();
      const items: Expr[] = [];
      while (this.tok && !this.isP("]")) items.push(this.select());
      this.expectP("]", t);
      return { t: "list", items, ...pos };
    }
    if (this.isP("{")) return this.set(false, pos);
    return this.unexpected();
  }

  private set(rec: boolean, pos: Pos): Expr {
    const open = this.expectP("{");
    const binds = this.binds("}");
    this.expectP("}", open);
    return { t: "set", rec, binds, ...pos };
  }

  // ---- bindings -------------------------------------------------------------------------

  private binds(stop: "}" | "in"): Bind[] {
    const binds: Bind[] = [];
    while (this.tok && !(stop === "}" ? this.isP("}") : this.isK("in"))) {
      const start = this.i;
      try {
        binds.push(this.bind());
      } catch {
        this.resync(start); // the problem is already recorded
      }
    }
    return binds;
  }

  // After a broken binding: skip to just past its `;`, or stop before what closes the set.
  private resync(start: number): void {
    let depth = 0;
    while (this.tok) {
      const t = this.tok;
      if (this.isP("{") || this.isP("[") || this.isP("(") || this.isP("${")) depth++;
      else if (CLOSERS.has(t.kind === "punct" ? t.text : "")) {
        if (depth === 0) break;
        depth--;
      } else if (this.isK("in") && depth === 0) break;
      else if (this.isP(";") && depth === 0) {
        this.next();
        break;
      }
      this.next();
    }
    if (this.i === start) this.next(); // always make progress
  }

  private bind(): Bind {
    const first = this.tok as Token;
    const pos = this.at(first);
    if (this.isK("inherit")) {
      this.next();
      let from: Expr | undefined;
      if (this.isP("(")) {
        const open = this.next();
        from = this.expr();
        this.expectP(")", open);
      }
      const names: string[] = [];
      while (this.tok?.kind === "ident" || this.tok?.kind === "string") {
        const t = this.next();
        names.push(t.kind === "string" ? (t.value ?? "*") : t.text);
      }
      // `inherit a
      //  b = 1;` lost its `;`: the last name starts the next binding.
      if ((this.isP("=") || this.isP(".")) && names.length > 1) {
        this.i--;
        names.pop();
      }
      this.semicolon("inherit");
      return { t: "inherit", ...(from && { from }), names, pos };
    }
    const path = this.attrPath(true);
    if (!this.isP("=")) {
      const written = path.map((p) => p.name ?? "*").join(".");
      const at = this.tok;
      // The file ends here: what is missing is the closing bracket, reported by whoever opened it.
      if (!at) throw new Bail();
      if (!CLOSERS.has(at.text) && !this.isP(";")) {
        this.fail({
          code: "syntax-expected",
          params: { expected: "=", found: this.shown(at) },
          ...this.at(at),
        });
      }
      this.fail({ code: "syntax-incomplete", params: { path: written }, ...pos });
    }
    this.next();
    const value = this.expr();
    this.semicolon(path.map((p) => p.name ?? "*").join("."));
    return { t: "attr", path, value, pos };
  }

  // `a.b."c".${d}`. Inside a binding, a path that stops at a dot is reported as incomplete.
  private attrPath(binding = false): AttrPart[] {
    const parts: AttrPart[] = [];
    for (;;) {
      const t = this.tok;
      if (t?.kind === "ident" && !(binding && KEYWORDS.has(t.text) && parts.length === 0)) {
        this.next();
        parts.push({ name: t.text, ...this.at(t) });
      } else if (t?.kind === "string") {
        this.next();
        parts.push({ ...(t.value !== undefined && { name: t.value }), ...this.at(t) });
      } else if (t && this.isP("${")) {
        const open = this.next();
        this.expr();
        this.expectP("}", open);
        parts.push(this.at(t));
      } else if (binding && parts.length > 0) {
        const first = parts[0] as AttrPart;
        this.fail({
          code: "syntax-incomplete",
          params: { path: parts.map((p) => p.name ?? "*").join(".") },
          line: first.line,
          col: first.col,
        });
      } else {
        return this.unexpected();
      }
      if (!this.isP(".")) return parts;
      this.next();
    }
  }
}

// A bracket left open or a file that ends early is usually the aftermath of an earlier mistake:
// hide those while there is something more specific to fix.
const AFTERSHOCKS = new Set<Problem["code"]>([
  "syntax-unclosed",
  "syntax-expected-eof",
  "syntax-unexpected-eof",
]);
const withoutAftershocks = (problems: Problem[]): Problem[] => {
  const rest = problems.filter((p) => !AFTERSHOCKS.has(p.code));
  return rest.length > 0 ? rest : problems;
};

/** Parses Nix source. The tree can be partial when there are problems: broken bindings are left out. */
export function parse(source: string): { ast?: Expr; problems: Problem[]; lexical: boolean } {
  const { tokens, errors } = lex(source);
  if (tokens.length === 0 && errors.length === 0) return { problems: [], lexical: false };
  const parser = new Parser(tokens);
  const ast = parser.parseProgram();
  const lexical = errors.length > 0;
  // A string or comment left open garbles everything after it: report only that.
  const problems: Problem[] = lexical
    ? errors.map((e) => ({ ...e, params: {} }))
    : withoutAftershocks(parser.problems);
  return { ...(ast && { ast }), problems, lexical };
}
