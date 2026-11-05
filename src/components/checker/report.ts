import { applyAll, applyFix, wordAt } from "../../lib/fix";
import type { Diagnostic, Report } from "../../lib/validate";
import { coverageGroups } from "./coverage";
import { el, type Translate } from "./dom";
import { snippet } from "./snippet";

export interface ReportView {
  /** Brings the editor into view, for a finding that points at the text (on a narrow screen it is apart). */
  reveal: () => void;
  source: HTMLTextAreaElement;
  results: HTMLElement;
  tr: Translate;
  /** Validates again, after a fix changed the text. */
  rerun: () => void;
}

// A button that selects the offending word in the text, so it can be found at a glance.
function gotoButton(view: ReportView, d: Diagnostic): HTMLElement {
  const { source, tr } = view;
  const button = el("button", "where", tr("result.line", { line: d.line, col: d.col }));
  button.setAttribute("type", "button");
  button.title = tr("result.goto");
  button.addEventListener("click", () => {
    const [start, end] = wordAt(source.value, d.line, d.col);
    view.reveal();
    source.focus();
    source.setSelectionRange(start, end);
  });
  return button;
}

function fixButton(view: ReportView, label: string, apply: () => string | undefined) {
  const button = el("button", "btn fix", label) as HTMLButtonElement;
  button.type = "button";
  button.addEventListener("click", () => {
    // Computed now, not when the report was drawn: the text may have been edited since.
    const fixed = apply();
    if (fixed === undefined) return;
    view.source.value = fixed;
    view.rerun();
  });
  return button;
}

function diagnosticCard(view: ReportView, d: Diagnostic): HTMLElement {
  const { source, tr } = view;
  const card = el("article", `diag finding ${d.severity}`);
  const message = el("p", "msg");
  message.append(el("span", "sev", tr(`result.${d.severity}`)), tr(`diag.${d.code}`, d.params));
  card.append(message, snippet(source.value, d));
  if (d.suggestion)
    card.append(el("p", "hint", tr("result.suggest", { suggestion: d.suggestion })));
  if (d.options) {
    card.append(el("p", "hint", tr("result.available", { options: d.options.join(", ") })));
  }
  card.append(gotoButton(view, d));
  if (applyFix(source.value, d) !== undefined) {
    card.append(fixButton(view, tr("result.apply"), () => applyFix(source.value, d)));
  }
  if (d.docUrl) {
    const link = el("a", "docs", tr("result.docs")) as HTMLAnchorElement;
    link.href = d.docUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    card.append(link);
  }
  return card;
}

// "1 error and 2 warnings": what is zero is left out, and the word agrees with the number.
export function counts(tr: Translate, errors: number, warnings: number): string {
  const part = (kind: "error" | "warning", n: number) =>
    n === 0 ? [] : [tr(`result.${kind}Count.${n === 1 ? "one" : "many"}`, { n })];
  return [...part("error", errors), ...part("warning", warnings)].join(tr("result.and"));
}

/** Draws the summary, the fix-all button and one card per diagnostic. */
export function showReport(
  view: ReportView,
  report: Report,
  catalogSource: string,
  command: string,
): void {
  const { source, results, tr } = view;
  const errors = report.diagnostics.filter((d) => d.severity === "error").length;
  const warnings = report.diagnostics.length - errors;
  const total = report.diagnostics.length;
  const { coverage } = report;

  results.replaceChildren();
  const facts = el("div", "facts");
  facts.append(
    el(
      "p",
      `summary ${total ? "bad" : "good"}`,
      total ? counts(tr, errors, warnings) : tr("result.clean"),
    ),
  );
  // What a clean result does not mean, said in words that do not compete with the findings.
  if (!total) facts.append(el("p", "caveat", tr("result.ok")));
  const fixable = report.diagnostics.filter((d) => applyFix(source.value, d) !== undefined);
  if (fixable.length > 1) {
    facts.append(fixButton(view, tr("result.applyAll"), () => applyAll(source.value, fixable)));
  }

  // What it was checked against: useful, but after what has to be fixed, and folded away.
  const meta = el("details", "meta");
  meta.append(el("summary", "", tr("result.details")));
  meta.append(
    el("p", "fact", tr("result.detected", { target: tr(`target.${report.target}`) })),
    el("p", "fact", tr("result.catalog", { source: catalogSource })),
    el(
      "p",
      "fact",
      tr("result.coverage", {
        checked: coverage.total - coverage.skipped.length,
        total: coverage.total,
      }),
    ),
  );
  const skips = coverageGroups(view, report);
  if (skips) meta.append(skips);
  // For what a page that only reads the text cannot judge: imports, mkIf, assertions.
  meta.append(el("p", "fact", tr("result.command")), el("code", "command", command));

  const findings = el("div", "findings");
  for (const d of report.diagnostics) findings.append(diagnosticCard(view, d));
  const drawn = el("div", "report");
  drawn.append(facts, findings, meta);
  results.append(drawn);
}
