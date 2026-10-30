import { docUrl, type IndexedOption, type OptionTree, type Target, type Version } from "./catalog";
import {
  candidates,
  childrenOf,
  findExact,
  findOwner,
  knownPrefix,
  siblings,
} from "./catalog/tree";
import { findMistakes } from "./nix/mistakes";
import { type Problem, parse } from "./nix/parse";
import { type Assignment, scan } from "./nix/scan";
import { closest, distance } from "./suggest";

export type TargetChoice = Target | "auto";

export type DiagnosticCode =
  | Problem["code"]
  | "undefined-variable"
  | "not-callable-list"
  | "not-callable-string"
  | "not-callable-number"
  | "list-plus"
  | "concat-non-list"
  | "nothing-to-check"
  | "unknown-option"
  | "type-mismatch"
  | "deprecated"
  | "hidden-option";

export interface Diagnostic {
  severity: "error" | "warning";
  code: DiagnosticCode;
  line: number;
  col: number;
  /** Values for the `{placeholders}` of the message template `diag.<code>`. */
  params: Record<string, string>;
  suggestion?: string;
  /** What the catalog offers where the path goes wrong, nearest to what was written first. */
  options?: string[];
  docUrl?: string;
}

export interface Report {
  target: Target;
  diagnostics: Diagnostic[];
}

/** What can be learned from the source alone, before any catalog is loaded. */
export interface Analysis {
  syntax: Diagnostic[];
  assignments: Assignment[];
}

export function analyze(source: string): Analysis {
  const { ast, problems, lexical } = parse(source);
  const syntax: Diagnostic[] = problems.map((p) => ({ severity: "error", ...p }));
  // An unterminated string or comment garbles what follows, so nothing is read after one.
  const { assignments, undefinedNames } =
    ast && !lexical ? scan(ast) : { assignments: [], undefinedNames: [] };
  for (const { name, line, col } of undefinedNames) {
    syntax.push({ severity: "error", code: "undefined-variable", line, col, params: { name } });
  }
  // Calls that cannot work, found anywhere in the file (a flake's `outputs` included).
  for (const { code, name, line, col } of ast && !lexical ? findMistakes(ast) : []) {
    syntax.push({ severity: "error", code, line, col, params: { name } });
  }
  // A file with no attribute set to read (e.g. a bare function call): say so instead of
  // reporting a clean bill of health for a file nothing was checked in.
  if (ast && syntax.length === 0 && assignments.length === 0) {
    syntax.push({
      severity: "warning",
      code: "nothing-to-check",
      line: ast.line,
      col: ast.col,
      params: {},
    });
  }
  return { syntax, assignments };
}

/** Guesses what kind of file it is from the top-level attributes. */
export function detectTarget(assignments: Assignment[]): Target {
  const roots = new Set(assignments.map((a) => a.path[0]));
  if (roots.has("inputs") || roots.has("outputs") || roots.has("nixConfig")) return "flake";
  if (roots.has("disko")) return "disko";
  if (roots.has("home")) return "home-manager";
  return "nixos";
}

export const resolveTarget = (analysis: Analysis, choice: TargetChoice): Target =>
  choice === "auto" ? detectTarget(analysis.assignments) : choice;

// Closest known path to `path`, with `*` filled in from what the user wrote.
function suggest(tree: OptionTree, path: string[], known: number): string | undefined {
  const written = path.join(".");
  const found =
    closest(written, siblings(tree, path, known)) ?? closest(written, candidates(tree, path));
  return found === written ? undefined : found;
}

function typeMismatch(entry: IndexedOption, a: Assignment): string | undefined {
  const { type } = entry;
  if (a.kind === "other" || type === "any" || type === "hidden") return undefined;
  if (type === "enum") {
    const ok = a.kind === "str" && (a.value === undefined || entry.values?.includes(a.value));
    return ok ? undefined : `enum(${entry.values?.join(" | ")})`;
  }
  // The manuals describe the final type of coercing types, so an int may be valid for a string.
  if (type === "str" && a.kind === "int") return undefined;
  const expected = type === "set" ? "attrs" : type;
  return expected === a.kind ? undefined : expected;
}

// The options the catalog offers after the first `known` segments, nearest to `written` first.
const OPTIONS_SHOWN = 8;
function available(tree: OptionTree, path: string[], known: number, written?: string): string[] {
  const names = childrenOf(tree, path.slice(0, known));
  const ranked = written
    ? [...names].sort((a, b) => distance(written, a) - distance(written, b) || (a < b ? -1 : 1))
    : names;
  return ranked.slice(0, OPTIONS_SHOWN);
}

/** Checks an analyzed file against the options of `target`. */
export function check(
  analysis: Analysis,
  target: Target,
  tree: OptionTree,
  version?: Version,
): Report {
  // An assignment cut short (`gnome.`, `services.openssh`) still gets what the catalog can offer.
  const diagnostics = analysis.syntax.map((d): Diagnostic => {
    if (d.code !== "syntax-incomplete") return d;
    const path = (d.params.path ?? "").split(".");
    const known = knownPrefix(tree, path);
    const options = available(tree, path, known, path[known]);
    return {
      ...d,
      ...(options.length > 0 && { options }),
      docUrl: docUrl(target, d.params.path, version),
    };
  });
  const reported = new Set<string>();

  // Renamed and hidden options still work (or fail) upstream: warn, do not error.
  const warnIfOutdated = (
    entry: IndexedOption,
    path: string,
    at: { line: number; col: number },
  ) => {
    if (entry.renamedTo) {
      diagnostics.push({
        severity: "warning",
        code: "deprecated",
        ...at,
        params: { path, replacement: entry.renamedTo },
        docUrl: docUrl(target, entry.renamedTo, version),
      });
    } else if (entry.type === "hidden") {
      diagnostics.push({
        severity: "warning",
        code: "hidden-option",
        ...at,
        params: { path },
        docUrl: docUrl(target, path, version),
      });
    }
  };

  for (const a of analysis.assignments) {
    const at = { line: a.line, col: a.col };
    const path = a.path.join(".");
    const exact = findExact(tree, a.path);
    // An entry above this path that cannot be checked any deeper (free-form set, opaque
    // type, or an alias whose children are unknown).
    const owner = findOwner(tree, a.path);

    if (exact) {
      const expected = typeMismatch(exact, a);
      if (expected) {
        diagnostics.push({
          severity: "error",
          code: "type-mismatch",
          ...at,
          params: { path, expected, got: a.kind },
          docUrl: docUrl(target, exact.path, version),
        });
      }
      warnIfOutdated(exact, path, at);
    } else if (owner) {
      // Nothing below can be checked, but an outdated owner is worth saying once.
      const ownerPath = a.path.slice(0, owner.segs.length).join(".");
      if (!reported.has(ownerPath)) {
        reported.add(ownerPath);
        warnIfOutdated(owner, ownerPath, at);
      }
    } else {
      const known = knownPrefix(tree, a.path);
      if (known === a.path.length) {
        // A group such as `services.openssh`: it can only hold a set.
        if (a.kind !== "attrs" && a.kind !== "other") {
          diagnostics.push({
            severity: "error",
            code: "type-mismatch",
            ...at,
            params: { path, expected: "attrs", got: a.kind },
            docUrl: docUrl(target, undefined, version),
          });
        }
        continue;
      }
      const key = a.path.slice(0, known + 1).join(".");
      if (reported.has(key)) continue;
      reported.add(key);
      const suggestion = suggest(tree, a.path, known);
      const options = available(tree, a.path, known, a.path[known]);
      diagnostics.push({
        severity: "error",
        code: "unknown-option",
        ...at,
        params: { path },
        ...(suggestion && { suggestion }),
        ...(options.length > 0 && { options }),
        docUrl: docUrl(target, suggestion ?? path, version),
      });
    }
  }

  diagnostics.sort((x, y) => x.line - y.line || x.col - y.col);
  return { target, diagnostics };
}

/** Synchronous convenience over `analyze` + `check`, for callers that already hold the catalogs. */
export function validate(
  source: string,
  choice: TargetChoice,
  catalogs: Record<Target, OptionTree>,
  version?: Version,
): Report {
  const analysis = analyze(source);
  const target = resolveTarget(analysis, choice);
  return check(analysis, target, catalogs[target], version);
}
