import { wordAt } from "../../lib/fix";
import { highlight, segments } from "../../lib/nix/highlight";
import type { Diagnostic } from "../../lib/validate";
import { el, type Translate } from "./dom";
import { RULER } from "./ruler";

// Past this much text, coloring it at every keystroke costs more than it helps: it is shown plain.
const MAX_COLORED = 200_000;

/**
 * Line numbers beside the text (red or yellow where the last validation found something), the cursor
 * position, and the text in colors with the findings underlined, as an editor shows them. Returns what
 * the page needs to call.
 */
export function setupEditor(
  source: HTMLTextAreaElement,
  gutter: HTMLElement,
  cursor: HTMLElement,
  layer: HTMLElement,
  tr: Translate,
  onEdit: () => void,
) {
  let marks = new Map<number, string>();
  let findings: Diagnostic[] = [];
  let ranges: Array<{ start: number; end: number; finding: Diagnostic }> = [];
  let painted = 0;
  let queued = false;

  // What sits behind the text moves with it: the colors, and the line at the column to keep within.
  const follow = () => {
    layer.scrollTop = source.scrollTop;
    layer.scrollLeft = source.scrollLeft;
    layer.parentElement?.style.setProperty("--scroll-left", `${source.scrollLeft}px`);
  };

  // The colored copy of the text under the text. The underlines are only drawn for the text as it was
  // validated: the first edit clears them.
  const color = () => {
    queued = false;
    const text = source.value;
    const on = text.length <= MAX_COLORED;
    layer.parentElement?.parentElement?.classList.toggle("hl", on);
    if (!on) return layer.replaceChildren();
    const underlines = findings.map((d) => {
      const [start, end] = wordAt(text, d.line, d.col);
      return { start, end: Math.max(end, start + 1), severity: d.severity };
    });
    ranges = underlines.map((u, n) => ({ ...u, finding: findings[n] as Diagnostic }));
    const pieces = segments(text, highlight(text), underlines).map(
      ({ text: piece, kind, severity }) => {
        if (!kind && !severity) return document.createTextNode(piece);
        const span = el(
          "span",
          [kind && `tok-${kind}`, severity && `mk-${severity}`].filter(Boolean).join(" "),
          piece,
        );
        return span;
      },
    );
    // The newline that ends the text, so an empty last line is as tall as in the text area.
    layer.replaceChildren(...pieces, document.createTextNode("\n"));
    follow();
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(color);
  };

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
    const col = before.length - before.lastIndexOf("\n");
    cursor.textContent = tr("result.line", { line, col });
    // Past the line at the ruler: the position says so.
    cursor.classList.toggle("over", col > RULER);
  };

  // The text changed: the marks belonged to the old lines.
  const refresh = () => {
    marks = new Map();
    findings = [];
    paint(true);
    where();
    schedule();
  };

  source.addEventListener("input", () => {
    onEdit();
    refresh();
  });
  source.addEventListener("scroll", () => {
    gutter.scrollTop = source.scrollTop;
    follow();
  });
  document.addEventListener("selectionchange", () => {
    if (document.activeElement === source) where();
  });
  refresh();
  // Colored before the first frame, so the text is never drawn transparent over nothing.
  color();

  return {
    refresh,
    /** The finding underlined at this offset of the text, if there is one. */
    findingAt: (offset: number) => ranges.find((r) => offset >= r.start && offset < r.end)?.finding,
    /** Colors the line numbers of the diagnostics: an error wins over a warning on the same line. */
    mark(diagnostics: Diagnostic[]) {
      for (const d of diagnostics) {
        if (d.severity === "error" || !marks.has(d.line)) marks.set(d.line, d.severity);
      }
      paint(true);
      findings = diagnostics;
      schedule();
    },
  };
}
