import { loadCatalog, type Version } from "../../lib/catalog";
import { EXAMPLE } from "../../lib/example";
import { format } from "../../lib/i18n";
import {
  analyze,
  bestReport,
  candidateTargets,
  check,
  type TargetChoice,
} from "../../lib/validate";
import { el } from "./dom";
import { setupDraft } from "./draft";
import { setupEditor } from "./editor";
import { download, reportData } from "./export";
import { setupFiles } from "./files";
import { showReport } from "./report";

// How long the text must rest before it is validated by itself (the button validates at once).
const PAUSE_MS = 700;

const query = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector);
const root = query("#checker");
const source = query<HTMLTextAreaElement>("#source");
const target = query<HTMLSelectElement>("#target");
const version = query<HTMLSelectElement>("#version");
const results = query("#results");
const gutter = query("#gutter");
const cursor = query("#cursor");

if (root?.dataset.messages && source && target && version && results && gutter && cursor) {
  const text = JSON.parse(root.dataset.messages) as Record<string, string>;
  const tr = (key: string, params?: Record<string, string | number>) =>
    format(text[key] ?? key, params);
  let pause: ReturnType<typeof setTimeout> | undefined;
  const editor = setupEditor(source, gutter, cursor, tr, () => {
    // Results describe the text as it was when validated: dim them as soon as it changes.
    results.setAttribute("data-stale", "");
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
  const say = (key: string, params?: Record<string, string | number>) => {
    offer(undefined);
    results.replaceChildren(el("p", "empty", tr(key, params)));
  };

  // Only the latest run may touch the page: catalogs download asynchronously.
  let run = 0;
  const render = async () => {
    const current = ++run;
    clearTimeout(pause);
    results.removeAttribute("data-stale");
    editor.refresh();
    if (!source.value.trim()) return say("result.empty");

    const analysis = analyze(source.value);
    const kinds = candidateTargets(analysis, target.value as TargetChoice);
    const release = version.value as Version;
    let catalogs: Awaited<ReturnType<typeof loadCatalog>>[];
    try {
      results.setAttribute("aria-busy", "true");
      const paths = analysis.assignments.map((a) => a.path);
      const base = root.dataset.base ?? "/";
      catalogs = await Promise.all(kinds.map((kind) => loadCatalog(kind, release, base, paths)));
    } catch {
      if (current === run) say("result.loadError");
      return;
    } finally {
      if (current === run) results.removeAttribute("aria-busy");
    }
    if (current !== run) return;

    const reports = kinds.map((kind, n) =>
      check(analysis, kind, (catalogs[n] as (typeof catalogs)[number]).tree, release),
    );
    const report = bestReport(reports);
    const catalog = catalogs[kinds.indexOf(report.target)] as (typeof catalogs)[number];
    editor.mark(report.diagnostics);
    showReport({ source, results, tr, rerun: validate }, report, catalog.source);
    offer(() => reportData(report, catalog.source, release));
  };

  // `void`: the handlers start a validation and have nothing to wait for.
  const validate = () => void render();
  target.addEventListener("change", validate);
  version.addEventListener("change", validate);
  query("#validate")?.addEventListener("click", validate);
  query("#example")?.addEventListener("click", () => {
    source.value = EXAMPLE;
    validate();
  });
  query("#clear")?.addEventListener("click", () => {
    source.value = "";
    validate();
  });
  const area = query(".editor");
  const input = query<HTMLInputElement>("#file");
  const opener = query("#open");
  if (area && input && opener) {
    setupFiles({ source, area, input, opener, tr, say, loaded: validate });
  }
  const remember = query<HTMLInputElement>("#remember");
  if (remember) setupDraft(source, remember);
  exporter?.addEventListener(
    "click",
    () => exportable && download("nixchecker-report.json", exportable()),
  );
  validate();
}
