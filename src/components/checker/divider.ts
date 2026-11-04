// The bar between the editor and the findings on a wide screen: drag it, or move it with the arrow keys, to
// give more room to one or the other. Double click puts it back. The width is kept in this browser.
// The findings take between a fifth and three fifths of the width, and never less than 20rem (the CSS says so too).
const MIN = 20;
const MAX = 60;
const MIN_REM = 20;
const DEFAULT = 28;
const STEP = 2;
const KEY = "results-width";

/** `root` holds the two sides; the share of its width that the findings take is the CSS variable. */
export function setupDivider(root: HTMLElement, divider: HTMLElement) {
  let share = DEFAULT;

  // The least the findings can take, as a share of what there is to share: 20rem on a window where that is more
  // than a fifth.
  const least = () => {
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const width = root.getBoundingClientRect().width;
    return width > 0 ? Math.min(MAX, Math.max(MIN, ((MIN_REM * rem) / width) * 100)) : MIN;
  };

  const set = (next: number, keep = false) => {
    const lowest = least();
    share = Math.min(MAX, Math.max(lowest, next));
    root.style.setProperty("--results-width", `${share}%`);
    // As a window splitter says it: how much of the whole the first side (the editor) has.
    divider.setAttribute("aria-valuenow", String(Math.round(100 - share)));
    divider.setAttribute("aria-valuemax", String(Math.round(100 - lowest)));
    if (!keep) return;
    try {
      localStorage.setItem(KEY, String(share));
    } catch {
      // A browser that keeps nothing still resizes for this visit.
    }
  };

  try {
    const kept = Number(localStorage.getItem(KEY));
    if (kept >= MIN && kept <= MAX) set(kept);
    else set(DEFAULT);
  } catch {
    // Nothing kept: the default.
  }

  const end = (event: PointerEvent) => {
    if (!divider.hasPointerCapture(event.pointerId)) return;
    divider.releasePointerCapture(event.pointerId);
    root.classList.remove("resizing");
    set(share, true);
  };
  divider.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    divider.setPointerCapture(event.pointerId);
    root.classList.add("resizing");
  });
  divider.addEventListener("pointermove", (event) => {
    if (!divider.hasPointerCapture(event.pointerId)) return;
    const box = root.getBoundingClientRect();
    set(((box.right - event.clientX) / box.width) * 100);
  });
  divider.addEventListener("pointerup", end);
  divider.addEventListener("pointercancel", end);
  divider.addEventListener("dblclick", () => set(DEFAULT, true));

  divider.addEventListener("keydown", (event) => {
    // Left makes the editor smaller, so the findings grow.
    const moves: Record<string, number> = {
      ArrowLeft: share + STEP,
      ArrowRight: share - STEP,
      Home: MAX,
      End: 0,
      Enter: DEFAULT,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    set(next, true);
  });
}
