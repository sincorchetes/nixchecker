import type { AttrPart, Bind, Expr } from "./ast";
import type { Problem } from "./cursor";
import { Bail, CLOSERS, KEYWORDS } from "./cursor";
import { Expressions } from "./expressions";
import { type Interpolation, lex, type Token } from "./lex";

export type { Problem } from "./cursor";

/** The whole parser: expressions plus bindings and attribute paths, with recovery between bindings. */
class Parser extends Expressions {
  parseProgram(): Expr | undefined {
    try {
      const expr = this.expr();
      if (this.tok) this.unexpected();
      return expr;
    } catch {
      return undefined; // a problem was recorded where it happened
    }
  }

  // ---- bindings -------------------------------------------------------------------------

  protected binds(stop: "}" | "in"): Bind[] {
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
  protected resync(start: number): void {
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

  protected bind(): Bind {
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
  protected attrPath(binding = false): AttrPart[] {
    const parts: AttrPart[] = [];
    for (;;) {
      const t = this.tok;
      if (t?.kind === "ident" && !KEYWORDS.has(t.text)) {
        this.next();
        parts.push({ name: t.text, ...this.at(t) });
      } else if (t?.kind === "string" && !t.indented) {
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

// The problems inside the `${ ... }` of strings, found by parsing each one as its own expression.
function interpolationProblems(interpolations: Interpolation[]): Problem[] {
  return interpolations.flatMap((inner) =>
    // `${}` holds no expression: the closing brace is what was not expected.
    (inner.text.trim() === ""
      ? [{ code: "syntax-unexpected" as const, params: { found: "}" }, line: 1, col: 1 }]
      : parse(inner.text).problems
    ).map((p) => ({
      ...p,
      line: inner.line + p.line - 1,
      col: p.line === 1 ? inner.col + p.col - 1 : p.col,
    })),
  );
}

/** Parses Nix source. The tree can be partial when there are problems: broken bindings are left out. */
export function parse(source: string): { ast?: Expr; problems: Problem[]; lexical: boolean } {
  const { tokens, errors, interpolations } = lex(source);
  if (tokens.length === 0 && errors.length === 0) return { problems: [], lexical: false };
  const parser = new Parser(tokens);
  const ast = parser.parseProgram();
  const lexical = errors.length > 0;
  // A string or comment left open garbles everything after it: report only that.
  const problems: Problem[] = lexical
    ? errors.map((e) => ({ ...e, params: {} }))
    : withoutAftershocks([...parser.problems, ...interpolationProblems(interpolations)]);
  return { ...(ast && { ast }), problems, lexical };
}
