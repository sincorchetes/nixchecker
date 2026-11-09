import type { Expr, Param, Pos } from "./ast";
import { Atoms } from "./atoms";
import { KEYWORDS, posOf } from "./cursor";
import type { Token } from "./lex";

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

// The precedence levels of the operators that cannot be chained: equality and order.
const NONASSOCIATIVE = new Set([3, 4]);

/** The expression grammar. Bindings, which it needs for sets and lets, come from the subclass. */
export abstract class Expressions extends Atoms {
  protected expr(): Expr {
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
        const consequent = this.expr();
        this.expectK("else");
        return { t: "if", cond, consequent, alternate: this.expr(), ...pos };
      }
      if (!KEYWORDS.has(t.text) && (this.isP(":", this.peek()) || this.isP("@", this.peek()))) {
        return this.lambda(pos);
      }
    }
    if (this.isP("{") && this.startsFormals()) return this.lambda(pos);
    return this.binary(0);
  }

  // Does the `{` at the cursor open a function's argument set (`{ a, b }:`) and not an attribute set?
  protected startsFormals(): boolean {
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

  protected lambda(pos: Pos): Expr {
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
        break; // nothing may follow it but the closing brace
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
    const param: Param = { kind: "formals", names, ...(alias && { alias }) };
    return { t: "lambda", param, body: this.expr(), ...pos };
  }

  protected letIn(pos: Pos): Expr {
    this.next();
    const binds = this.binds("in");
    this.expectK("in");
    return { t: "let", binds, body: this.expr(), ...pos };
  }

  protected binary(min: number): Expr {
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
      // Comparisons do not chain in Nix: `a == b == c` and `a < b > c` are syntax errors.
      const again = this.tok?.kind === "punct" ? BINARY[this.tok.text] : undefined;
      if (again?.[0] === entry[0] && NONASSOCIATIVE.has(entry[0])) this.unexpected();
    }
  }

  protected hasAttr(): Expr {
    let base = this.negate();
    while (this.isP("?")) {
      this.next();
      base = { t: "hasattr", base, path: this.attrPath(), ...posOf(base) };
    }
    return base;
  }

  protected negate(): Expr {
    const t = this.tok;
    if (t && this.isP("-")) {
      this.next();
      return { t: "unary", op: "-", arg: this.negate(), ...this.at(t) };
    }
    return this.application();
  }
}
