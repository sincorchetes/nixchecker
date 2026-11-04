import type { Version } from "../../lib/catalog";
import { CatalogError, systemsFor } from "../../lib/catalog";
import { EXAMPLE } from "../../lib/example";
import { format } from "../../lib/i18n";
import type { TargetChoice } from "../../lib/validate";
import { setupDivider } from "./divider";
import { el } from "./dom";
import { setupDraft } from "./draft";
import { setupEditor } from "./editor";
import { createEngine } from "./engine";
import { download, reportData } from "./export";
import { setupFiles } from "./files";
import { showReport } from "./report";
import { setupStatus } from "./status";
import { setupTooltip } from "./tooltip";

// How long the text must rest before it is validated by itself (the button validates at once).
const PAUSE_MS = 700;

const query = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector);
const root = query("#checker");
const source = query<HTMLTextAreaElement>("#source");
const target = query<HTMLSelectElement>("#target");
const version = query<HTMLSelectElement>("#version");
const system = query<HTMLSelectElement>("#system");
const results = query("#results");
const gutter = query("#gutter");
const layer = query("#highlight");
const cursor = query("#cursor");

if (
  root?.dataset.messages &&
  source &&
  target &&
  version &&
  system &&
  results &&
  gutter &&
  cursor &&
  layer
) {
  const text = JSON.parse(root.dataset.messages) as Record<string, string>;
  const tr = (key: string, params?: Record<string, string | number>) =>
    format(text[key] ?? key, params);
  const status = setupStatus(root, tr);
  const divider = query("#divider");
  if (divider) setupDivider(root, divider);
  // The text a button replaced, until the next edit: offered back, instead of asking before replacing.
  const undo = query("#undo");
  let previous: string | undefined;
  const forget = () => {
    previous = undefined;
    if (undo) undo.hidden = true;
  };
  let pause: ReturnType<typeof setTimeout> | undefined;
  const editor = setupEditor(source, gutter, cursor, layer, tr, () => {
    // Results describe the text as it was when validated: dim them as soon as it changes.
    results.setAttribute("data-stale", "");
    status.stale();
    forget();
    clearTimeout(pause);
    pause = setTimeout(validate, PAUSE_MS);
  });
  const exporter = query<HTMLButtonElement>("#export");
  // What the download button hands over: the last report, until there is none.
  let exportable: (() => unknown) | undefined;
  const offer = (data: (() => unknown) | undefined) => {
    exportable = data;
    if (exporter) exporter.disabled = !data;
  };
  const engine = createEngine();
  const say = (key: string, params?: Record<string, string | number>) => {
    offer(undefined);
    results.replaceChildren(el("p", "empty", tr(key, params)));
    // Anything but the empty text is something to read now, even from the editor's side of a narrow screen.
    if (key === "result.empty") return status.idle();
    status.failed();
    status.view("problems");
  };

  // Only the latest run may touch the page: catalogs download asynchronously.
  let run = 0;
  const render = async () => {
    const current = ++run;
    clearTimeout(pause);
    results.removeAttribute("data-stale");
    editor.refresh();
    if (!source.value.trim()) return say("result.empty");
    status.busy();

    let verdict: Awaited<ReturnType<typeof engine>>;
    try {
      results.setAttribute("aria-busy", "true");
      verdict = await engine({
        text: source.value,
        choice: target.value as TargetChoice,
        release: version.value as Version,
        base: root.dataset.base ?? "/",
      });
    } catch (error) {
      if (current !== run) return;
      if (error instanceof CatalogError) return say("result.loadError");
      // A bug of ours, not the connection: said as such, and logged for whoever reports it.
      console.error("nixchecker: internal error while validating", error);
      return say("result.internalError");
    } finally {
      if (current === run) results.removeAttribute("aria-busy");
    }
    if (current !== run) return;

    const { report } = verdict;
    editor.mark(report.diagnostics);
    status.done(report);
    showReport(
      { source, results, tr, rerun: validate, reveal: () => status.view("editor") },
      report,
      verdict.source,
    );
    offer(() => reportData(report, verdict.source, version.value, system.value));
  };

  // The systems that suit the chosen target; one that no longer suits gives way to the first that does.
  const syncSystems = () => {
    const fits = systemsFor(target.value) as readonly string[];
    for (const option of system.options) option.disabled = !fits.includes(option.value);
    if (!fits.includes(system.value)) system.value = fits[0] as string;
  };
  target.addEventListener("change", syncSystems);

  // `void`: the handlers start a validation and have nothing to wait for.
  const validate = () => void render();
  target.addEventListener("change", validate);
  version.addEventListener("change", validate);
  system.addEventListener("change", validate);
  // Asked for on purpose: the findings are shown where they were not beside the editor.
  query("#validate")?.addEventListener("click", () => {
    validate();
    status.view("problems");
  });
  query("#view-editor")?.addEventListener("click", () => status.view("editor"));
  query("#view-problems")?.addEventListener("click", () => status.view("problems"));

  // Replaces the text and offers it back: the browser's own undo does not remember what a script put in.
  const replace = (next: string) => {
    const before = source.value;
    if (before.trim() && before !== next && undo) {
      previous = before;
      undo.hidden = false;
    }
    source.value = next;
    validate();
  };
  query("#undo-button")?.addEventListener("click", () => {
    if (previous === undefined) return;
    source.value = previous;
    forget();
    source.focus();
    validate();
  });
  query("#example")?.addEventListener("click", () => replace(EXAMPLE));
  query("#clear")?.addEventListener("click", () => replace(""));
  const area = query(".editor");
  if (area) setupTooltip(area, layer, editor.findingAt, tr);
  const input = query<HTMLInputElement>("#file");
  const opener = query("#open");
  if (area && input && opener) {
    setupFiles({ area, input, opener, tr, say, replace });
  }
  const remember = query<HTMLInputElement>("#remember");
  if (remember) setupDraft(source, remember);
  exporter?.addEventListener(
    "click",
    () => exportable && download("nixchecker-report.json", exportable()),
  );
  validate();

  // After the first visit the page and the catalogs it used are kept for when there is no connection.
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    const base = root.dataset.base ?? "/";
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {});
  }
}
