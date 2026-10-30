import type { Target } from "./catalog";
import { findMistakes } from "./nix/mistakes";
import { type Problem, parse } from "./nix/parse";
import { type Assignment, scan } from "./nix/scan";

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

// What the top-level attributes say about the kind of file, when they say anything.
function signal(assignments: Assignment[]): Target | undefined {
  const roots = new Set(assignments.map((a) => a.path[0]));
  if (roots.has("inputs") || roots.has("outputs") || roots.has("nixConfig")) return "flake";
  if (roots.has("disko")) return "disko";
  if (roots.has("home")) return "home-manager";
  return undefined;
}

/** Guesses what kind of file it is from the top-level attributes. */
export const detectTarget = (assignments: Assignment[]): Target => signal(assignments) ?? "nixos";

export const resolveTarget = (analysis: Analysis, choice: TargetChoice): Target =>
  choice === "auto" ? detectTarget(analysis.assignments) : choice;

/**
 * The targets worth checking against. A chosen one, or one the file points at, is the only
 * candidate. Otherwise NixOS and Home Manager both look possible (`programs`, `services`...
 * exist in each), and the caller keeps whichever finds fewer errors.
 */
export function candidateTargets(analysis: Analysis, choice: TargetChoice): Target[] {
  if (choice !== "auto") return [choice];
  const found = signal(analysis.assignments);
  return found ? [found] : ["nixos", "home-manager"];
}
