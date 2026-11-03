import type { Bind, Expr, Param } from "./ast";

export type ValueKind = "bool" | "str" | "int" | "list" | "attrs" | "other";

export interface Assignment {
  /** Full attribute path, e.g. ["services", "openssh", "enable"]. */
  path: string[];
  line: number;
  col: number;
  kind: ValueKind;
  /** Raw content of a plain string value, used to check enums. */
  value?: string;
  /** The kind of each element of a list written out in full. */
  items?: ValueKind[];
  /** The text of each element that is a plain string, for those a list has (the others are undefined). */
  itemValues?: Array<string | undefined>;
  /** A set written out that cannot be a derivation (see `plainSet`): never what a package option takes. */
  plain?: boolean;
  /** The same, for each element of a list that has a set. */
  itemPlain?: boolean[];
}

/** A name used as a whole value (`a = foo;`) that nothing in scope defines. */
export interface UndefinedName {
  name: string;
  line: number;
  col: number;
}

// Names that exist without being declared in the file.
const GLOBALS = new Set([
  "true",
  "false",
  "null",
  "builtins",
  "import",
  "abort",
  "throw",
  "toString",
  "map",
  "removeAttrs",
  "derivation",
  "baseNameOf",
  "dirOf",
  "isNull",
  "fetchTarball",
  "fetchGit",
  "fetchurl",
  "placeholder",
  "scopedImport",
]);

/** What a block introduces; `open` is a `with`, after which any name may be defined. */
interface Scope {
  names: Set<string>;
  open?: boolean;
  parent?: Scope | undefined;
}

const defined = (scope: Scope | undefined, name: string): boolean => {
  if (GLOBALS.has(name)) return true;
  for (let s = scope; s; s = s.parent) if (s.open || s.names.has(name)) return true;
  return false;
};

const bindNames = (binds: Bind[]): Set<string> =>
  new Set(
    binds.flatMap((b) =>
      b.t === "inherit" ? b.names : ([b.path[0]?.name].filter(Boolean) as string[]),
    ),
  );

const paramNames = (param: Param): Set<string> =>
  param.kind === "ident"
    ? new Set([param.name])
    : new Set([...param.names, ...(param.alias ? [param.alias] : [])]);

const BOOLEAN_OPERATORS = new Set(["&&", "||", "==", "!=", "<", "<=", ">", ">=", "->"]);
// `mkDefault x` and the like give the option the type of `x`.
const WRAPPERS = new Set(["mkDefault", "mkForce"]);

// The name a function is called by: `mkDefault` or `lib.mkDefault`.
function calledName(fn: Expr): string | undefined {
  if (fn.t === "ident") return fn.name;
  if (
    fn.t === "select" &&
    fn.base.t === "ident" &&
    fn.base.name === "lib" &&
    fn.path.length === 1
  ) {
    return fn.path[0]?.name;
  }
  return undefined;
}

/**
 * The bindings of every literal set that makes up `value`: the set itself, or the sets on either
 * side of `//` (whose keys all end up in the result). Undefined when `value` is neither, so
 * nothing is said about what it holds. `rec` sets stay opaque.
 */
function literalSets(value: Expr): Bind[][] | undefined {
  if (value.t === "paren") return literalSets(value.inner);
  if (value.t === "set") return value.rec ? undefined : [value.binds];
  if (value.t === "binary" && value.op === "//") {
    const sides = [literalSets(value.left), literalSets(value.right)];
    return sides.some(Boolean) ? sides.flatMap((side) => side ?? []) : undefined;
  }
  return undefined;
}

/**
 * A set written out in the file that cannot be a derivation: Nix takes a set for one only when it says
 * `type = "derivation"`, so a set with no `type` among keys it spells out (no `inherit`, no `rec`, no
 * computed name) is not. `pkgs.hello // { ... }` is not such a set: what is on the other side is unknown.
 */
function plainSet(e: Expr): boolean {
  if (e.t === "paren") return plainSet(e.inner);
  if (e.t !== "set" || e.rec) return false;
  return e.binds.every(
    (b) => b.t !== "inherit" && b.path[0]?.name !== undefined && b.path[0].name !== "type",
  );
}

interface Classified {
  kind: ValueKind;
  value?: string;
  items?: ValueKind[];
  itemValues?: Array<string | undefined>;
  plain?: boolean;
  itemPlain?: boolean[];
  /** Set when the value is a lone name, to check that it is defined. */
  name?: Extract<Expr, { t: "ident" }>;
}

function classify(e: Expr): Classified {
  switch (e.t) {
    case "paren":
      return classify(e.inner);
    case "str":
      return e.value === undefined ? { kind: "str" } : { kind: "str", value: e.value };
    case "num":
      return { kind: e.float ? "other" : "int" };
    case "list": {
      // A set in a list is judged only when it cannot be a derivation; any other set stays unjudged.
      const parts = e.items.map(
        (item): Classified => (plainSet(item) ? { kind: "attrs", plain: true } : classify(item)),
      );
      return {
        kind: "list",
        items: parts.map((part) => part.kind),
        ...(parts.some((part) => part.kind === "str") && {
          itemValues: parts.map((part) => part.value),
        }),
        ...(parts.some((part) => part.kind === "attrs") && {
          itemPlain: parts.map((part) => part.plain === true),
        }),
      };
    }

    case "ident":
      if (e.name === "true" || e.name === "false") return { kind: "bool" };
      return { kind: "other", name: e };
    case "unary":
      return { kind: e.op === "!" ? "bool" : "other" };
    case "binary":
      if (BOOLEAN_OPERATORS.has(e.op)) return { kind: "bool" };
      if (e.op === "++") return { kind: "list" };
      return { kind: e.op === "//" ? "attrs" : "other" };
    case "app": {
      const fn = calledName(e.fn);
      if (fn && WRAPPERS.has(fn)) return classify(e.arg);
      // `mkOverride 50 x` and `mkIf cond x`: the value is the last argument.
      if (e.fn.t === "app") {
        const outer = calledName(e.fn.fn);
        if (outer === "mkOverride" || outer === "mkIf") return classify(e.arg);
      }
      return { kind: "other" };
    }
    default:
      return { kind: "other" };
  }
}

/**
 * Walks the root attribute set of a module and returns every `a.b.c = value;` with its full
 * path. The root is found through function arguments, `let`, `with`, `assert` and parentheses.
 * Only sets reached through a direct `path = { ... };` are descended into: `mkIf`, lists,
 * functions and `rec` sets stay opaque on purpose, so the checker never reports what it
 * cannot be sure about.
 */
export function scan(ast: Expr): { assignments: Assignment[]; undefinedNames: UndefinedName[] } {
  const assignments: Assignment[] = [];
  const undefinedNames: UndefinedName[] = [];

  const scanSet = (prefix: string[], binds: Bind[], scope: Scope | undefined) => {
    for (const bind of binds) {
      if (bind.t === "inherit") continue;
      const first = bind.path[0];
      if (!first) continue;
      const path = [...prefix, ...bind.path.map((part) => part.name ?? "*")];
      const at = { line: first.line, col: first.col };
      const { value } = bind;
      const sets = literalSets(value);
      if (sets) {
        assignments.push({ path, kind: "attrs", ...(plainSet(value) && { plain: true }), ...at });
        for (const binds of sets) scanSet(path, binds, scope);
        continue;
      }
      const { name, ...kind } = classify(value);
      assignments.push({ path, ...kind, ...at });
      if (name && !defined(scope, name.name)) {
        undefinedNames.push({ name: name.name, line: name.line, col: name.col });
      }
    }
  };

  let scope: Scope | undefined;
  let node = ast;
  for (;;) {
    if (node.t === "set") {
      const inner = node.rec ? { names: bindNames(node.binds), parent: scope } : scope;
      scanSet([], node.binds, inner);
      return { assignments, undefinedNames };
    }
    if (node.t === "lambda") scope = { names: paramNames(node.param), parent: scope };
    else if (node.t === "let") scope = { names: bindNames(node.binds), parent: scope };
    else if (node.t === "with") scope = { names: new Set(), open: true, parent: scope };
    else if (node.t !== "assert" && node.t !== "paren") return { assignments, undefinedNames };
    node = node.t === "paren" ? node.inner : node.body;
  }
}
