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
import { setupEditor } from "./editor";
import { showReport } from "./report";

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
  const editor = setupEditor(source, gutter, cursor, tr, () => {
    // Results describe the text as it was when validated: dim them as soon as it changes.
    results.setAttribute("data-stale", "");
  });
  const say = (key: string) => results.replaceChildren(el("p", "empty", tr(key)));

  // Only the latest run may touch the page: catalogs download asynchronously.
  let run = 0;
  const render = async () => {
    const current = ++run;
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
    showReport({ source, results, tr, rerun: render }, report, catalog.source);
  };

  target.addEventListener("change", render);
  version.addEventListener("change", render);
  query("#validate")?.addEventListener("click", render);
  query("#example")?.addEventListener("click", () => {
    source.value = EXAMPLE;
    render();
  });
  query("#clear")?.addEventListener("click", () => {
    source.value = "";
    render();
  });
  render();
}
