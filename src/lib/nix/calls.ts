import type { Bind, Expr, Param } from "./ast";

export type NotCallable = "list" | "string" | "number";

/** A call that is certain to fail: `xs [ 1 ]` where `xs` is a list (a `++` was probably meant). */
export interface BadCall {
  /** What was called: a name, or a stand-in such as `[ … ]` for a literal. */
  name: string;
  kind: NotCallable;
  line: number;
  col: number;
}

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

// The kind of a value that can never be called, if the expression is one.
function uncallable(
  e: Expr,
  env: Env,
  seen = new Set<Expr>(),
): { name: string; kind: NotCallable } | undefined {
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
      return uncallable(e.inner, env, seen);
    case "ident": {
      const bound = env.get(e.name);
      const kind = bound && uncallable(bound, env, seen)?.kind;
      return kind ? { name: e.name, kind } : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Finds calls whose function is a list, a string or a number, directly or through a name bound
 * to one with `let` or `rec`. Sets are left alone (they can be callable through `__functor`).
 */
export function findBadCalls(ast: Expr): BadCall[] {
  const found: BadCall[] = [];

  const walk = (e: Expr, env: Env): void => {
    switch (e.t) {
      case "app": {
        const bad = uncallable(e.fn, env);
        if (bad) found.push({ ...bad, line: e.fn.line, col: e.fn.col });
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
