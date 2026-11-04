import type { Analysis, Report } from "./analysis";
import type { OptionTree } from "./catalog";
import { type Catalog, loadExtended, type Target, type Version } from "./catalog";
import { splitPath } from "./catalog/path";
import { findExact } from "./catalog/tree";
import { looksLikeConf, parseConf } from "./nixconf/parse";
import {
  analyze,
  bestReport,
  candidateTargets,
  check,
  foldUnrelated,
  type TargetChoice,
} from "./validate";

export interface Checked {
  analysis: Analysis;
  report: Report;
  /** Where the catalog it was checked against comes from. */
  source: string;
  /** That catalog, with the parts the text needed loaded. */
  tree: OptionTree;
}

// A renamed option passes its value on to the option it was renamed to, which is held to that one's type:
// that one can be in a part of the catalog the text did not touch, so the parts it is in are loaded too
// (a few rounds, for a rename of a rename).
const RENAME_ROUNDS = 4;

async function loadWithRenames(
  kind: Target,
  release: Version,
  base: string,
  paths: string[][],
  fetcher: typeof fetch | undefined,
): Promise<Catalog> {
  let catalog = await loadExtended(kind, release, base, paths, fetcher);
  const asked = new Set(paths.map((p) => p.join(".")));
  let frontier = paths;
  for (let round = 0; round < RENAME_ROUNDS; round++) {
    const targets = frontier
      .map((p) => findExact(catalog.tree, p)?.renamedTo)
      .filter((to): to is string => to !== undefined && !asked.has(to));
    if (targets.length === 0) break;
    for (const to of targets) asked.add(to);
    frontier = targets.map(splitPath);
    catalog = await loadExtended(kind, release, base, frontier, fetcher);
  }
  return catalog;
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
  // A nix.conf is not Nix: chosen, or (when not told) a text that only has that shape.
  const conf = choice === "nix-conf" || (choice === "auto" && looksLikeConf(text));
  const analysis = conf ? parseConf(text) : analyze(text);
  const kinds: Target[] = conf ? ["nix-conf"] : candidateTargets(analysis, choice);
  const paths = analysis.assignments.map((a) => a.path);
  const catalogs = await Promise.all(
    kinds.map((kind) => loadWithRenames(kind, release, base, paths, fetcher)),
  );
  const reports = kinds.map((kind, n) =>
    check(analysis, kind, (catalogs[n] as (typeof catalogs)[number]).tree, release),
  );
  const best = bestReport(reports);
  const catalog = catalogs[kinds.indexOf(best.target)] as (typeof catalogs)[number];
  // A file that was not told what it is, and has no key that is an option of what it was held against, is
  // not a module of it: one warning instead of an error for each key.
  const report = choice === "auto" && !conf ? foldUnrelated(best, analysis, catalog.tree) : best;
  return { analysis, report, source: catalog.source, tree: catalog.tree };
}
