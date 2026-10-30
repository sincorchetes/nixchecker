import type { Analysis, Diagnostic, Report, TargetChoice } from "./analysis";
import { analyze, resolveTarget } from "./analysis";
import { docUrl, type IndexedOption, type OptionTree, type Target, type Version } from "./catalog";
import {
  candidates,
  childrenOf,
  findExact,
  findOwner,
  knownPrefix,
  siblings,
} from "./catalog/tree";
import type { Assignment } from "./nix/scan";
import { byName } from "./sort";
import { closest, distance } from "./suggest";

export {
  type Analysis,
  analyze,
  candidateTargets,
  type Diagnostic,
  type DiagnosticCode,
  detectTarget,
  type Report,
  resolveTarget,
  type TargetChoice,
} from "./analysis";

// Closest known path to `path`, with `*` filled in from what the user wrote.
function suggest(tree: OptionTree, path: string[], known: number): string | undefined {
  const written = path.join(".");
  const found =
    closest(written, siblings(tree, path, known)) ?? closest(written, candidates(tree, path));
  return found === written ? undefined : found;
}

/** Whether the catalog entry can say anything about this value: not a dynamic one, not `any`. */
const verifies = (entry: IndexedOption, a: Assignment): boolean =>
  a.kind !== "other" &&
  entry.type !== "any" &&
  entry.type !== "hidden" &&
  !(entry.type === "enum" && a.kind === "str" && a.value === undefined);

// A path that is a known group of options (`services.openssh`) rather than an option itself.
const isGroup = (tree: OptionTree, path: string[]): boolean =>
  knownPrefix(tree, path) === path.length;

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
    ? [...names].sort((a, b) => distance(written, a) - distance(written, b) || byName(a, b))
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
  let unchecked = 0;

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
    // Dynamic values and free-form places are read but not verified.
    if (exact ? !verifies(exact, a) : owner || (a.kind === "other" && isGroup(tree, a.path))) {
      unchecked++;
    }

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
  return { target, diagnostics, coverage: { total: analysis.assignments.length, unchecked } };
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

const errorsIn = (report: Report) =>
  report.diagnostics.filter((d) => d.severity === "error").length;

/** Of the reports for each candidate target, the one with the fewest errors (the first on a tie). */
export function bestReport(reports: Report[]): Report {
  return reports.reduce(
    (best, next) => (errorsIn(next) < errorsIn(best) ? next : best),
    reports[0] as Report,
  );
}
