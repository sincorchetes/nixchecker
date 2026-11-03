// The static layer of a check, for a text in memory: the analysis of the page against the catalog of a
// release on disk.
import { join } from "node:path";
import { loadCatalog } from "../../src/lib/catalog/load";
import type { Version } from "../../src/lib/catalog/versions";
import {
  analyze,
  check,
  type Diagnostic,
  resolveTarget,
  type TargetChoice,
} from "../../src/lib/validate";
import { fromDiagnostic, type Located } from "./report";

export const publicDir = join(import.meta.dir, "..", "..", "public");
export const fromDisk = (async (url) =>
  new Response(Bun.file(join(publicDir, String(url))))) as typeof fetch;

export interface StaticResult {
  analysis: ReturnType<typeof analyze>;
  target: ReturnType<typeof resolveTarget>;
  items: Located[];
  /** What `items` were made from, in the same order: the fixes are proposed by these. */
  diagnostics: Diagnostic[];
  /** Assignments the analysis could judge, out of all of them. */
  coverage: { checked: number; total: number };
}

export async function staticLayer(
  text: string,
  choice: string | undefined,
  version: Version,
): Promise<StaticResult> {
  const analysis = analyze(text);
  const target = resolveTarget(analysis, (choice ?? "auto") as TargetChoice);
  const catalog = await loadCatalog(
    target,
    version,
    "/",
    analysis.assignments.map((a) => a.path),
    fromDisk,
  );
  const report = check(analysis, target, catalog.tree, version);
  const { total, skipped } = report.coverage;
  return {
    analysis,
    target,
    items: report.diagnostics.map(fromDiagnostic),
    diagnostics: report.diagnostics,
    coverage: { checked: total - skipped.length, total },
  };
}
