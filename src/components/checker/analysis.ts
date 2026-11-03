import { loadCatalog, type Version } from "../../lib/catalog";
import {
  analyze,
  bestReport,
  candidateTargets,
  check,
  type Report,
  type TargetChoice,
} from "../../lib/validate";

/** What to validate: the text, which target and release to hold it against, and where catalogs live. */
export interface Request {
  text: string;
  choice: TargetChoice;
  release: Version;
  base: string;
}

export interface Verdict {
  report: Report;
  /** Where the catalog it was checked against comes from. */
  source: string;
}

/**
 * The whole job of validating a text: read it, download the parts of the catalogs it needs and check it
 * against each target it may be for. It touches no page, so it runs in a worker as well as in the page.
 * It throws when a catalog cannot be downloaded.
 */
export async function validateText({ text, choice, release, base }: Request): Promise<Verdict> {
  const analysis = analyze(text);
  const kinds = candidateTargets(analysis, choice);
  const paths = analysis.assignments.map((a) => a.path);
  const catalogs = await Promise.all(kinds.map((kind) => loadCatalog(kind, release, base, paths)));
  const reports = kinds.map((kind, n) =>
    check(analysis, kind, (catalogs[n] as (typeof catalogs)[number]).tree, release),
  );
  const report = bestReport(reports);
  const catalog = catalogs[kinds.indexOf(report.target)] as (typeof catalogs)[number];
  return { report, source: catalog.source };
}
