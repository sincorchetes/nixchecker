import type { Bind, Expr, Param } from "./ast";

type Kind = "list" | "string" | "number";

/** Code that is valid syntax but certain to fail when evaluated, with the message to show. */
export interface Mistake {
  code:
    | "not-callable-list"
    | "not-callable-string"
    | "not-callable-number"
    | "list-plus"
    | "concat-non-list";
  /** What is at fault: a name, or a stand-in such as `[ … ]` for a literal. */
  name: string;
  line: number;
  col: number;
}

const NOT_CALLABLE: Record<Kind, Mistake["code"]> = {
  list: "not-callable-list",
  string: "not-callable-string",
  number: "not-callable-number",
};

/** Names in scope, mapped to the expression they were bound to; undefined when it is not known. */
type Env = Map<string, Expr | undefined>;

const paramNames = (param: Param): string[] =>
  param.kind === "ident" ? [param.name] : [...param.names, ...(param.alias ? [param.alias] : [])];

// What the bindings introduce: a plain `name = value;` is known, anything else is not.
function extend(env: Env, binds: Bind[]): Env {
  const next = new Map(env);
  for (const bind of binds) {
    if (bind.t === "inherit") for (const name of bind.names) next.set(name, undefined);
    else if (bind.path[0]?.name !== undefined) {
      next.set(bind.path[0].name, bind.path.length === 1 ? bind.value : undefined);
    }
  }
  return next;
}

// The kind of value the expression is certain to be, when it is a list, a string or a number.
function known(
  e: Expr,
  env: Env,
  seen = new Set<Expr>(),
): { name: string; kind: Kind } | undefined {
  if (seen.has(e)) return undefined;
  seen.add(e);
  switch (e.t) {
    case "list":
      return { name: "[ … ]", kind: "list" };
    case "str":
      return { name: '"…"', kind: "string" };
    case "num":
      return { name: "…", kind: "number" };
    case "paren":
      return known(e.inner, env, seen);
    case "ident": {
      const bound = env.get(e.name);
      const kind = bound && known(bound, env, seen)?.kind;
      return kind ? { name: e.name, kind } : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Finds what can never work: calling a list, a string or a number, adding lists with `+`, and
 * joining something that is not a list with `++`. Values are followed through names bound with
 * `let` or `rec`. Sets are left alone (they can be callable through `__functor`).
 */
export function findMistakes(ast: Expr): Mistake[] {
  const found: Mistake[] = [];

  // `xs + ys` on lists, and `++` with a string or a number on either side.
  const checkOperator = (e: Extract<Expr, { t: "binary" }>, env: Env): void => {
    for (const side of [e.left, e.right]) {
      const value = known(side, env);
      const wrong =
        (e.op === "+" && value?.kind === "list") ||
        (e.op === "++" && value !== undefined && value.kind !== "list");
      if (value && wrong) {
        const code = e.op === "+" ? "list-plus" : "concat-non-list";
        found.push({ code, name: value.name, line: side.line, col: side.col });
      }
    }
  };

  const walk = (e: Expr, env: Env): void => {
    switch (e.t) {
      case "app": {
        const bad = known(e.fn, env);
        if (bad) {
          found.push({
            code: NOT_CALLABLE[bad.kind],
            name: bad.name,
            line: e.fn.line,
            col: e.fn.col,
          });
        }
        walk(e.fn, env);
        walk(e.arg, env);
        return;
      }
      case "list":
        for (const item of e.items) walk(item, env);
        return;
      case "set":
      case "let": {
        const inner = e.t === "let" || e.rec ? extend(env, e.binds) : env;
        for (const bind of e.binds) {
          if (bind.t === "attr") walk(bind.value, inner);
          else if (bind.from) walk(bind.from, inner);
        }
        if (e.t === "let") walk(e.body, inner);
        return;
      }
      case "lambda": {
        const inner = new Map(env);
        for (const name of paramNames(e.param)) inner.set(name, undefined);
        walk(e.body, inner);
        return;
      }
      case "select":
        walk(e.base, env);
        if (e.fallback) walk(e.fallback, env);
        return;
      case "hasattr":
        walk(e.base, env);
        return;
      case "unary":
        walk(e.arg, env);
        return;
      case "binary":
        checkOperator(e, env);
        walk(e.left, env);
        walk(e.right, env);
        return;
      case "if":
        walk(e.cond, env);
        walk(e.then, env);
        walk(e.else, env);
        return;
      case "with":
        walk(e.env, env);
        walk(e.body, env);
        return;
      case "assert":
        walk(e.cond, env);
        walk(e.body, env);
        return;
      case "paren":
        walk(e.inner, env);
        return;
      default:
        return;
    }
  };

  walk(ast, new Map());
  return found;
}
