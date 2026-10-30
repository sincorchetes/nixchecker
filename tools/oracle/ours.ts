// Our verdict on a module, in the same terms as the oracle's, using the generated NixOS catalog.
import { join } from "node:path";
import { loadCatalog } from "../../src/lib/catalog/load";
import type { Version } from "../../src/lib/catalog/versions";
import { analyze, check } from "../../src/lib/validate";
import type { Kind, Verdict } from "./nix";

const publicDir = join(import.meta.dir, "..", "..", "public");
const files = (async (url) => new Response(Bun.file(join(publicDir, String(url))))) as typeof fetch;

export interface Ours extends Verdict {
  /** The paths of the assignments we read, for the oracle to force. */
  paths: string[][];
}

export async function judgeOurs(
  source: string,
  kind: Kind = "nixos",
  version: Version = "unstable",
): Promise<Ours> {
  const analysis = analyze(source);
  const paths = analysis.assignments.map((a) => a.path);
  const catalog = await loadCatalog(kind, version, "/", paths, files);
  const codes = check(analysis, kind, catalog.tree, version).diagnostics.map((d) => d.code);
  return {
    paths,
    unknown: codes.includes("unknown-option"),
    typeError: codes.includes("type-mismatch"),
  };
}
