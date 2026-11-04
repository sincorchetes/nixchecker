import type { Diagnostic } from "../../lib/validate";
import { el, type Translate } from "./dom";

const MARKS = ".mk-error, .mk-warning";

// Where a node starts in the text its siblings make up: the colored copy is the text cut in pieces.
function offsetOf(node: Node): number {
  let offset = 0;
  for (let before = node.previousSibling; before; before = before.previousSibling) {
    offset += before.textContent?.length ?? 0;
  }
  return offset;
}

/**
 * What a mark says, in a box by the pointer while it rests on the underlined text, as an editor shows it.
 * The text area is over the colored copy and takes the pointer, so the copy is asked what is under it
 * for the length of one look. The results beside the editor say the same, and are what assistive
 * technology reads: the box is for the eyes.
 */
export function setupTooltip(
  area: HTMLElement,
  layer: HTMLElement,
  findingAt: (offset: number) => Diagnostic | undefined,
  tr: Translate,
) {
  const tip = el("div", `tip`);
  tip.hidden = true;
  tip.setAttribute("aria-hidden", "true");
  area.append(tip);

  const hide = () => {
    tip.hidden = true;
  };

  const show = (d: Diagnostic, x: number, y: number) => {
    const message = el("p", `msg ${d.severity}`);
    message.append(el("span", "sev", tr(`result.${d.severity}`)), tr(`diag.${d.code}`, d.params));
    tip.replaceChildren(message);
    if (d.suggestion)
      tip.append(el("p", "hint", tr("result.suggest", { suggestion: d.suggestion })));
    tip.hidden = false;
    // By the pointer, kept inside the window.
    const box = tip.getBoundingClientRect();
    const left = Math.max(8, Math.min(x + 12, window.innerWidth - box.width - 8));
    const below = y + 22 + box.height < window.innerHeight;
    tip.style.left = `${left}px`;
    tip.style.top = `${below ? y + 22 : y - box.height - 10}px`;
  };

  let queued = false;
  area.addEventListener("mousemove", (event) => {
    if (queued) return;
    queued = true;
    const { clientX: x, clientY: y } = event;
    requestAnimationFrame(() => {
      queued = false;
      layer.style.pointerEvents = "auto";
      const mark = document
        .elementsFromPoint(x, y)
        .find((e) => layer.contains(e) && e.matches(MARKS));
      layer.style.pointerEvents = "";
      const finding = mark && findingAt(offsetOf(mark));
      if (finding) show(finding, x, y);
      else hide();
    });
  });
  area.addEventListener("mouseleave", hide);
  area.addEventListener("input", hide, true);
  area.addEventListener("keydown", hide, true);
  area.addEventListener("scroll", hide, true);
}
