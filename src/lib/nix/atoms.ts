import type { AttrPart, Bind, Expr, Pos } from "./ast";
import { Cursor, KEYWORDS, posOf } from "./cursor";

/** The simple expressions: applications, selections, literals, lists, sets and parentheses. */
export abstract class Atoms extends Cursor {
  protected abstract expr(): Expr;
  protected abstract binds(stop: "}" | "in"): Bind[];
  protected abstract attrPath(binding?: boolean): AttrPart[];

  // Does `name = ...` (or `a.b = ...`) begin at `at`? An argument can never be followed by `=`, so
  // this is the next binding and not another argument: the `;` before it was forgotten.
  protected startsBinding(at: number): boolean {
    let n = at;
    while (this.isP(".", this.toks[n + 1])) n += 2;
    const name = this.toks[n];
    return (name?.kind === "ident" || name?.kind === "string") && this.isP("=", this.toks[n + 1]);
  }

  protected canStartArgument(): boolean {
    const t = this.tok;
    if (!t) return false;
    if ((t.kind === "ident" || t.kind === "string") && this.startsBinding(this.i)) return false;
    if (t.kind === "ident") return (!KEYWORDS.has(t.text) && t.text !== "or") || t.text === "rec";
    if (t.kind === "punct") return ["(", "[", "{"].includes(t.text);
    return true;
  }

  protected application(): Expr {
    let fn = this.select();
    while (this.canStartArgument()) {
      const arg = this.select();
      fn = { t: "app", fn, arg, ...posOf(fn) };
    }
    return fn;
  }

  protected select(): Expr {
    const base = this.atom();
    if (!this.isP(".")) return this.orArgument(base);
    this.next();
    const path = this.attrPath();
    let fallback: Expr | undefined;
    if (this.isK("or")) {
      this.next();
      fallback = this.select();
    }
    return { t: "select", base, path, ...(fallback && { fallback }), ...posOf(base) };
  }

  // `f or`: Nix still reads an `or` right after a simple expression as an argument named `or`
  // (the old way of calling nixpkgs' function of that name). Anywhere else `or` is a keyword.
  protected orArgument(fn: Expr): Expr {
    const t = this.tok;
    if (!t || !this.isK("or")) return fn;
    this.next();
    return { t: "app", fn, arg: { t: "ident", name: "or", ...this.at(t) }, ...posOf(fn) };
  }

  protected atom(): Expr {
    const t = this.tok;
    if (!t) return this.unexpected();
    const pos = this.at(t);
    switch (t.kind) {
      case "number":
        this.next();
        return { t: "num", float: t.float === true, text: t.text, ...pos };
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
        if (KEYWORDS.has(t.text) || t.text === "or") return this.unexpected();
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

  protected set(rec: boolean, pos: Pos): Expr {
    const open = this.expectP("{");
    const binds = this.binds("}");
    this.expectP("}", open);
    return { t: "set", rec, binds, ...pos };
  }
}
