import type { Analysis, Diagnostic, DiagnosticCode, Report } from "./analysis";
import type { OptionTree } from "./catalog";
import { knownPrefix } from "./catalog/tree";
import { distance } from "./suggest";

/**
 * For a file whose kind was not told but guessed: when none of its keys is, or is close to, an option of
 * the target it was held against, it is no module of it (a library, a package, an overlay, or only options
 * of modules of your own), and one warning stands for an error on each key. A misspelling is close to a
 * real option and stays an error; so does anything under a target someone chose.
 */
// Whether what is written is a misspelling of the suggestion: at most a third of its letters differ. (A
// suggestion is offered for much less, but a two-letter name is "close" to everything.)
const isMisspelling = (d: Diagnostic): boolean => {
  const written = d.params.path ?? "";
  return (
    d.suggestion !== undefined && distance(written, d.suggestion) <= Math.floor(written.length / 3)
  );
};

export function foldUnrelated(report: Report, analysis: Analysis, tree: OptionTree): Report {
  // What was found about the assignments (the rest is about how the file is written).
  const ABOUT_OPTIONS: DiagnosticCode[] = [
    "unknown-option",
    "type-mismatch",
    "deprecated",
    "hidden-option",
  ];
  const found = report.diagnostics.filter((d) => ABOUT_OPTIONS.includes(d.code));
  const first = analysis.assignments[0];
  const unrelated =
    found.length > 0 &&
    found.every((d) => d.code === "unknown-option" && !isMisspelling(d)) &&
    analysis.assignments.every((a) => knownPrefix(tree, a.path) === 0);
  if (!unrelated || !first) return report;

  const note: Diagnostic = {
    severity: "warning",
    code: "not-a-module",
    line: first.line,
    col: first.col,
    params: {},
  };
  const kept = report.diagnostics.filter((d) => !found.includes(d));
  return {
    ...report,
    diagnostics: [...kept, note].sort((x, y) => x.line - y.line || x.col - y.col),
  };
}
