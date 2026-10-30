import { applyAll, applyFix, wordAt } from "../../lib/fix";
import type { Diagnostic, Report } from "../../lib/validate";
import { el, type Translate } from "./dom";

export interface ReportView {
  source: HTMLTextAreaElement;
  results: HTMLElement;
  tr: Translate;
  /** Validates again, after a fix changed the text. */
  rerun: () => void;
}

// A button that selects the offending word in the text, so it can be found at a glance.
function gotoButton({ source, tr }: ReportView, d: Diagnostic): HTMLElement {
  const button = el("button", "where", tr("result.line", { line: d.line, col: d.col }));
  button.setAttribute("type", "button");
  button.title = tr("result.goto");
  button.addEventListener("click", () => {
    const [start, end] = wordAt(source.value, d.line, d.col);
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
  const card = el("article", `diag ${d.severity}`);
  card.append(el("p", "msg", tr(`diag.${d.code}`, d.params)), gotoButton(view, d));
  if (d.suggestion)
    card.append(el("p", "hint", tr("result.suggest", { suggestion: d.suggestion })));
  if (d.options) {
    card.append(el("p", "hint", tr("result.available", { options: d.options.join(", ") })));
  }
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

/** Draws the summary, the fix-all button and one card per diagnostic. */
export function showReport(view: ReportView, report: Report, catalogSource: string): void {
  const { source, results, tr } = view;
  const errors = report.diagnostics.filter((d) => d.severity === "error").length;
  const warnings = report.diagnostics.length - errors;
  const total = report.diagnostics.length;
  const { coverage } = report;

  results.replaceChildren();
  const head = el("div", "head");
  head.append(
    el(
      "span",
      `summary ${total ? "bad" : "good"}`,
      total ? tr("result.summary", { errors, warnings }) : tr("result.ok"),
    ),
    el(
      "span",
      "detected",
      [
        tr("result.detected", { target: tr(`target.${report.target}`) }),
        tr("result.catalog", { source: catalogSource }),
        tr("result.coverage", {
          checked: coverage.total - coverage.unchecked,
          total: coverage.total,
        }),
      ].join(" · "),
    ),
  );
  results.append(head);

  const fixable = report.diagnostics.filter((d) => applyFix(source.value, d) !== undefined);
  if (fixable.length > 1) {
    results.append(fixButton(view, tr("result.applyAll"), () => applyAll(source.value, fixable)));
  }
  for (const d of report.diagnostics) results.append(diagnosticCard(view, d));
}
