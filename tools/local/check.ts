// Checks a Nix file in two layers: the static analysis of the page, and the real module system of
// the Nix on this machine, which settles what the analysis can only guess (imports, mkIf, merging,
// priorities, assertions).
//   bun tools/local/check.ts <file.nix> [--target nixos|home-manager|disko] [--release unstable|26.05|25.11]
//        [--nixpkgs DIR] [--home-manager DIR] [--disko DIR] [--static] [--json]
// Without --nixpkgs (and --home-manager) the pinned sources of --release are built (needs Nix).
import { join } from "node:path";
import { loadCatalog } from "../../src/lib/catalog/load";
import { DEFAULT_VERSION, VERSIONS, type Version } from "../../src/lib/catalog/versions";
import { analyze, check, resolveTarget, type TargetChoice } from "../../src/lib/validate";
import { diskoRoot, releaseRoots } from "../corpus/sources";
import type { Kind } from "./expressions";
import { fromDiagnostic, fromFinding, type Located, printText } from "./report";
import { evaluate } from "./run-nix";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};
const file = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!file) {
  console.error("usage: check.ts <file.nix> [--target T] [--release V] [--static] [--json]");
  process.exit(2);
}
const version = (flag("release") ?? DEFAULT_VERSION) as Version;
if (!VERSIONS.includes(version)) throw new Error(`unknown release ${version}`);

const source = await Bun.file(file).text();
const analysis = analyze(source);
const target = resolveTarget(analysis, (flag("target") ?? "auto") as TargetChoice);
if (target === "flake")
  throw new Error("flakes are not evaluated yet: pass a module of the system");

// 1. The static layer, against the catalog of the release.
const publicDir = join(import.meta.dir, "..", "..", "public");
const files = (async (url) => new Response(Bun.file(join(publicDir, String(url))))) as typeof fetch;
const catalog = await loadCatalog(
  target,
  version,
  "/",
  analysis.assignments.map((a) => a.path),
  files,
);
const report = check(analysis, target, catalog.tree, version);
const items: Located[] = report.diagnostics.map(fromDiagnostic);
const { total, skipped } = report.coverage;
const coverage = `${total - skipped.length} of ${total} assignments checked statically.`;

// 2. The real evaluation, unless the text does not even parse.
const broken = items.some((i) => i.level === "syntax" && i.severity === "error");
const evaluated = !broken && !args.includes("--static");
if (evaluated) {
  const [nixpkgs, homeManager] =
    flag("nixpkgs") && flag("home-manager")
      ? [flag("nixpkgs") as string, flag("home-manager") as string]
      : await releaseRoots(version);
  const roots = {
    nixpkgs: nixpkgs as string,
    homeManager: homeManager as string,
    disko: flag("disko") ?? (await diskoRoot()),
  };
  for (const finding of await evaluate(target as Kind, roots, file)) {
    items.push(fromFinding(finding, analysis.assignments));
  }
}

if (args.includes("--json"))
  console.log(JSON.stringify({ target, version, evaluated, items }, null, 2));
else printText(items, coverage, evaluated || args.includes("--static"));
process.exit(items.some((i) => i.severity === "error") ? 1 : 0);
