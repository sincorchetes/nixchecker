// Our verdict on a module, in the same terms as the oracle's, using the generated NixOS catalog.
import { join } from "node:path";
import { loadCatalog } from "../../src/lib/catalog/load";
import { analyze, check } from "../../src/lib/validate";
import type { Verdict } from "./nix";

const publicDir = join(import.meta.dir, "..", "..", "public");
const files = (async (url) => new Response(Bun.file(join(publicDir, String(url))))) as typeof fetch;

export interface Ours extends Verdict {
  /** The paths of the assignments we read, for the oracle to force. */
  paths: string[][];
}

export async function judgeOurs(source: string): Promise<Ours> {
  const analysis = analyze(source);
  const paths = analysis.assignments.filter((a) => a.kind !== "attrs").map((a) => a.path);
  const catalog = await loadCatalog(
    "nixos",
    "unstable",
    "/",
    analysis.assignments.map((a) => a.path),
    files,
  );
  const codes = check(analysis, "nixos", catalog.tree, "unstable").diagnostics.map((d) => d.code);
  return {
    paths,
    unknown: codes.includes("unknown-option"),
    typeError: codes.includes("type-mismatch"),
  };
}
