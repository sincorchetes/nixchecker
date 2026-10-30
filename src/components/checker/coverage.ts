import { wordAt } from "../../lib/fix";
import type { Report, SkipCause } from "../../lib/validate";
import { el } from "./dom";
import type { ReportView } from "./report";

const CAUSES: SkipCause[] = ["dynamic", "any", "interpolated", "free-form"];

/** One button per reason: each press selects the next assignment skipped for that reason. */
export function coverageGroups(
  { source, tr }: ReportView,
  report: Report,
): HTMLElement | undefined {
  const { skipped } = report.coverage;
  if (skipped.length === 0) return undefined;
  const list = el("div", "skips");
  for (const cause of CAUSES) {
    const items = skipped.filter((s) => s.cause === cause);
    if (items.length === 0) continue;
    const button = el("button", `skip ${cause}`, tr(`coverage.${cause}`, { n: items.length }));
    button.setAttribute("type", "button");
    button.title = tr("result.goto");
    let next = 0;
    button.addEventListener("click", () => {
      const at = items[next++ % items.length];
      if (!at) return;
      const [start, end] = wordAt(source.value, at.line, at.col);
      source.focus();
      source.setSelectionRange(start, end);
    });
    list.append(button);
  }
  return list;
}
