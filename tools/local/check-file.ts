// Checks one Nix file in two layers: the static analysis against the catalog of the release, and the
// real evaluation of this machine's Nix, which settles what the analysis can only guess.
import { join, resolve } from "node:path";
import { loadCatalog } from "../../src/lib/catalog/load";
import type { Version } from "../../src/lib/catalog/versions";
import type { Finding } from "../../src/lib/evaluation";
import { analyze, check, resolveTarget, type TargetChoice } from "../../src/lib/validate";
import { diskoRoot, releaseRoots } from "../corpus/sources";
import type { Kind, Roots } from "./expressions";
import { evaluateFlake } from "./flake";
import { reconcile } from "./reconcile";
import { fromDiagnostic, fromFinding, type Located } from "./report";
import { evaluate } from "./run-nix";

export interface Options {
  target?: string | undefined;
  version: Version;
  nixpkgs?: string | undefined;
  homeManager?: string | undefined;
  disko?: string | undefined;
  static?: boolean | undefined;
}

export interface Result {
  file: string;
  target: string;
  version: Version;
  evaluated: boolean;
  coverage: string;
  items: Located[];
}

const publicDir = join(import.meta.dir, "..", "..", "public");
const files = (async (url) => new Response(Bun.file(join(publicDir, String(url))))) as typeof fetch;

// Building the pinned sources is slow, so a run over many files does it once per release.
const built = new Map<Version, Promise<Roots>>();
function rootsOf(o: Options): Promise<Roots> {
  if (!built.has(o.version)) {
    built.set(
      o.version,
      (async () => {
        const [nixpkgs, homeManager] =
          o.nixpkgs && o.homeManager ? [o.nixpkgs, o.homeManager] : await releaseRoots(o.version);
        return {
          nixpkgs: nixpkgs as string,
          homeManager: homeManager as string,
          disko: o.disko ?? (await diskoRoot()),
        };
      })(),
    );
  }
  return built.get(o.version) as Promise<Roots>;
}

export async function checkFile(file: string, o: Options): Promise<Result> {
  const analysis = analyze(await Bun.file(file).text());
  const target = resolveTarget(analysis, (o.target ?? "auto") as TargetChoice);

  const catalog = await loadCatalog(
    target,
    o.version,
    "/",
    analysis.assignments.map((a) => a.path),
    files,
  );
  const report = check(analysis, target, catalog.tree, o.version);
  let items: Located[] = report.diagnostics.map(fromDiagnostic);
  const { total, skipped } = report.coverage;
  const coverage = `${total - skipped.length} of ${total} assignments checked statically.`;

  // The real evaluation, unless the text does not even parse. A flake brings its own inputs.
  const broken = items.some((i) => i.level === "syntax" && i.severity === "error");
  const evaluated = !broken && !o.static;
  if (evaluated) {
    const found: Finding[] =
      target === "flake"
        ? await evaluateFlake(resolve(file))
        : await evaluate(target as Kind, await rootsOf(o), file);
    for (const finding of found) items.push(fromFinding(finding, analysis.assignments, file));
    items = reconcile(items, true).items;
  }
  return { file, target, version: o.version, evaluated, coverage, items };
}
