// Checks one Nix file in two layers: the static analysis against the catalog of the release, and the
// real evaluation of this machine's Nix, which settles what the analysis can only guess.
import { join, resolve } from "node:path";
import type { Target } from "../../src/lib/catalog";
import { catalogName, type Version } from "../../src/lib/catalog/versions";
import type { Finding } from "../../src/lib/evaluation";
import { type Analysis, analyze } from "../../src/lib/validate";
import { diskoRoot, releaseRoots } from "../corpus/sources";
import type { Kind, Roots } from "./expressions";
import { evaluateFlake } from "./flake";
import { reconcile } from "./reconcile";
import { fromFinding, isImported, type Located } from "./report";
import { evaluate } from "./run-nix";
import { publicDir, staticLayer } from "./static-layer";

export interface Options {
  target?: string | undefined;
  version: Version;
  nixpkgs?: string | undefined;
  homeManager?: string | undefined;
  disko?: string | undefined;
  static?: boolean | undefined;
  partial?: boolean | undefined;
}

/** Where the catalog a file was checked against comes from, as recorded when it was generated. */
export interface Provenance {
  name: string;
  source: string;
  revisions: Record<string, string>;
}

export interface Result {
  file: string;
  target: string;
  version: Version;
  evaluated: boolean;
  /** Assignments the static layer could judge, out of all of them. */
  coverage: { checked: number; total: number };
  catalog: Provenance;
  items: Located[];
}

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

// The options a file sets by name; a placeholder in the path stands for a name only the user knows.
const optionPaths = (analysis: ReturnType<typeof analyze>): string[][] =>
  analysis.assignments
    .map((a) => a.path)
    .filter((p) => !p.some((s) => s === "*" || s.startsWith("<")));

// Where to look for an option a finding is about: the file checked, or the imported module that defines
// it when it is on disk (the modules of nixpkgs are not the user's, and are not read).
async function assignmentsOf(finding: Finding, checked: string, own: Analysis) {
  if (!isImported(finding, checked)) return own.assignments;
  const path = finding.file as string;
  if (path.startsWith("/nix/store/") || !(await Bun.file(path).exists())) return [];
  return analyze(await Bun.file(path).text()).assignments;
}

async function provenance(name: string): Promise<Provenance> {
  const manifest = await Bun.file(join(publicDir, "catalog", "manifest.json")).json();
  const { source, revisions } = manifest.catalogs[name];
  return { name, source, revisions };
}

export async function checkFile(file: string, o: Options): Promise<Result> {
  const text = await Bun.file(file).text();
  const { analysis, target, coverage, ...layer } = await staticLayer(text, o.target, o.version);
  let { items } = layer;

  // The real evaluation, unless the text does not even parse. A flake brings its own inputs.
  const broken = items.some((i) => i.level === "syntax" && i.severity === "error");
  const evaluated = !broken && !o.static;
  if (evaluated) {
    const found: Finding[] =
      target === "flake"
        ? await evaluateFlake(resolve(file))
        : await evaluate(
            target as Kind,
            await rootsOf(o),
            file,
            o.partial ? optionPaths(analysis) : undefined,
          );
    for (const finding of found) {
      items.push(fromFinding(finding, await assignmentsOf(finding, file, analysis), file));
    }
    items = reconcile(items, true).items;
  }
  const origin = await provenance(catalogName(target as Target, o.version));
  return { file, target, version: o.version, evaluated, coverage, catalog: origin, items };
}
