// The static layer of a check, for a text in memory: the analysis of the page against the catalog of a
// release on disk.
import { join } from "node:path";
import type { Target } from "../../src/lib/catalog";
import type { Version } from "../../src/lib/catalog/versions";
import { checkText } from "../../src/lib/check-text";
import type { Analysis, Diagnostic, TargetChoice } from "../../src/lib/validate";
import { fromDiagnostic, type Located } from "./report";

export const publicDir = join(import.meta.dir, "..", "..", "public");
export const fromDisk = (async (url) =>
  new Response(Bun.file(join(publicDir, String(url))))) as typeof fetch;

export interface StaticResult {
  analysis: Analysis;
  target: Target;
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
  const { analysis, report } = await checkText(
    text,
    (choice ?? "auto") as TargetChoice,
    version,
    "/",
    fromDisk,
  );
  const { total, skipped } = report.coverage;
  return {
    analysis,
    target: report.target,
    items: report.diagnostics.map(fromDiagnostic),
    diagnostics: report.diagnostics,
    coverage: { checked: total - skipped.length, total },
  };
}
