import type { Analysis, Report } from "./analysis";
import { loadCatalog, type OptionTree, type Version } from "./catalog";
import { analyze, bestReport, candidateTargets, check, type TargetChoice } from "./validate";

export interface Checked {
  analysis: Analysis;
  report: Report;
  /** Where the catalog it was checked against comes from. */
  source: string;
  /** That catalog, with the parts the text needed loaded. */
  tree: OptionTree;
}

/**
 * The whole job of checking a text, the same for the page, the command line and the editor: read it,
 * download the parts of the catalogs it needs and hold it against each target it may be for. When the
 * text does not say what it is, NixOS and Home Manager both look possible and the one that finds fewer
 * errors wins. It throws when a catalog cannot be downloaded.
 */
export async function checkText(
  text: string,
  choice: TargetChoice,
  release: Version,
  base: string,
  fetcher?: typeof fetch,
): Promise<Checked> {
  const analysis = analyze(text);
  const kinds = candidateTargets(analysis, choice);
  const paths = analysis.assignments.map((a) => a.path);
  const catalogs = await Promise.all(
    kinds.map((kind) => loadCatalog(kind, release, base, paths, fetcher)),
  );
  const reports = kinds.map((kind, n) =>
    check(analysis, kind, (catalogs[n] as (typeof catalogs)[number]).tree, release),
  );
  const report = bestReport(reports);
  const catalog = catalogs[kinds.indexOf(report.target)] as (typeof catalogs)[number];
  return { analysis, report, source: catalog.source, tree: catalog.tree };
}
