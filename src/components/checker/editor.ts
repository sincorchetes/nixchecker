import type { Diagnostic } from "../../lib/validate";
import { el, type Translate } from "./dom";

/**
 * Line numbers beside the text (red or yellow where the last validation found something) and
 * the cursor position, as an editor's ruler shows it. Returns what the page needs to call.
 */
export function setupEditor(
  source: HTMLTextAreaElement,
  gutter: HTMLElement,
  cursor: HTMLElement,
  tr: Translate,
  onEdit: () => void,
) {
  let marks = new Map<number, string>();
  let painted = 0;

  const paint = (force = false) => {
    const lines = source.value.split("\n").length;
    if (!force && lines === painted) return;
    painted = lines;
    gutter.replaceChildren(
      ...Array.from({ length: lines }, (_, n) =>
        el("span", `ln ${marks.get(n + 1) ?? ""}`, String(n + 1)),
      ),
    );
    gutter.scrollTop = source.scrollTop;
  };

  const where = () => {
    const before = source.value.slice(0, source.selectionStart);
    const line = before.split("\n").length;
    cursor.textContent = tr("result.line", { line, col: before.length - before.lastIndexOf("\n") });
  };

  // The text changed: the marks belonged to the old lines.
  const refresh = () => {
    marks = new Map();
    paint(true);
    where();
  };

  source.addEventListener("input", () => {
    onEdit();
    refresh();
  });
  source.addEventListener("scroll", () => {
    gutter.scrollTop = source.scrollTop;
  });
  document.addEventListener("selectionchange", () => {
    if (document.activeElement === source) where();
  });
  refresh();

  return {
    refresh,
    /** Colors the line numbers of the diagnostics: an error wins over a warning on the same line. */
    mark(diagnostics: Diagnostic[]) {
      for (const d of diagnostics) {
        if (d.severity === "error" || !marks.has(d.line)) marks.set(d.line, d.severity);
      }
      paint(true);
    },
  };
}
