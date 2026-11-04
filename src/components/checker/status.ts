import type { Report } from "../../lib/validate";
import type { Translate } from "./dom";
import { counts } from "./report";

export type View = "editor" | "problems";

/**
 * What the page says about the validation outside the results themselves: a short state beside the Validate
 * button ("Validating…", "2 errors", "No problems", "Previous result") and, on a narrow screen where the
 * editor and the findings take turns, the buttons that switch between them with the number of problems on
 * one of them. The state is for the eyes: the results are what is announced.
 */
export function setupStatus(root: HTMLElement, tr: Translate) {
  const chip = root.querySelector<HTMLElement>("#state");
  const buttons: Record<View, HTMLElement | null> = {
    editor: root.querySelector("#view-editor"),
    problems: root.querySelector("#view-problems"),
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let shown = false;

  const say = (text: string, tone: string) => {
    clearTimeout(timer);
    if (!chip) return;
    chip.textContent = text;
    chip.dataset.tone = tone;
  };
  const problems = (n?: number) => {
    if (buttons.problems) {
      buttons.problems.textContent =
        n === undefined ? tr("result.viewProblems") : tr("result.viewProblemsN", { n });
    }
  };

  return {
    view(next: View) {
      root.dataset.view = next;
      for (const [name, button] of Object.entries(buttons)) {
        button?.setAttribute("aria-pressed", String(name === next));
      }
    },
    /** Nothing to validate. */
    idle() {
      shown = false;
      say("", "");
      problems();
    },
    /** A run has started: said only if it takes a moment, so a quick one does not flash. */
    busy() {
      clearTimeout(timer);
      timer = setTimeout(() => say(tr("result.validating"), "busy"), 150);
    },
    /** The text changed since the result: it describes the text as it was. */
    stale() {
      if (shown) say(tr("result.previous"), "stale");
    },
    done(report: Report) {
      shown = true;
      const errors = report.diagnostics.filter((d) => d.severity === "error").length;
      const total = report.diagnostics.length;
      say(total ? counts(tr, errors, total - errors) : tr("result.clean"), total ? "bad" : "good");
      problems(total || undefined);
    },
    failed() {
      shown = false;
      say(tr("result.failed"), "bad");
      problems();
    },
  };
}
