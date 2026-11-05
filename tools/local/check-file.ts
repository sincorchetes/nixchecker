// Checks one Nix file in two layers: the static analysis against the catalog of the release, and the
// real evaluation of this machine's Nix, which settles what the analysis can only guess.
import { join, resolve } from "node:path";
import type { Target } from "../../src/lib/catalog";
import { catalogName, type Version } from "../../src/lib/catalog/versions";
import type { Finding } from "../../src/lib/evaluation";
import { parse } from "../../src/lib/nix/parse";
import { type Analysis, analyze } from "../../src/lib/validate";
import { darwinRoot, diskoRoot, releaseRoots } from "../corpus/sources";
import type { Kind, Roots } from "./expressions";
import { evaluateFlake } from "./flake";
import { reconcile } from "./reconcile";
import { fromDiagnostic, fromFinding, isImported, type Located } from "./report";
import { evaluate } from "./run-nix";
import { publicDir, staticLayer } from "./static-layer";
import { systemFor } from "./system";

export interface Options {
  target?: string | undefined;
  nixDarwin?: string | undefined;
  system?: string | undefined;
  version: Version;
  nixpkgs?: string | undefined;
  homeManager?: string | undefined;
  disko?: string | undefined;
  static?: boolean | undefined;
  partial?: boolean | undefined;
  allOutputs?: boolean | undefined;
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
const built = new Map<Version, Promise<Omit<Roots, "system" | "nixDarwin">>>();
function rootsOf(o: Options): Promise<Omit<Roots, "system" | "nixDarwin">> {
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
  return built.get(o.version) as Promise<Omit<Roots, "system" | "nixDarwin">>;
}

// The keys of the module system itself, which are not options and cannot be read from `config`.
const MODULE_KEYS = new Set(["imports", "disabledModules", "options", "_module", "meta"]);

// The options a file sets by name, as paths into `config`: what is written under `config = { ... }` is
// read without that prefix, and a placeholder in a path stands for a name only the user knows.
const optionPaths = (analysis: Analysis): string[][] =>
  analysis.assignments
    .map((a) => (a.path[0] === "config" ? a.path.slice(1) : a.path))
    .filter((p) => p.length > 0 && !MODULE_KEYS.has(p[0] as string))
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

// What Nix says of a file. A whole system stops at the first wrong value; when that is what it stopped at,
// the options the file sets are read one by one too, so that every wrong value is in this run (the
// assertions of the system, which come after, wait until the values are right).
async function nixFindings(
  target: Target,
  file: string,
  analysis: Analysis,
  o: Options,
): Promise<Finding[]> {
  if (target === "flake") return evaluateFlake(resolve(file), o.allOutputs, o.system);
  const roots = {
    ...(await rootsOf(o)),
    nixDarwin: target === "nix-darwin" ? (o.nixDarwin ?? (await darwinRoot(o.version))) : "",
    system: await systemFor(o.system, target),
  };
  const options = optionPaths(analysis);
  const found = await evaluate(target as Kind, roots, file, o.partial ? options : undefined);
  const stoppedOnValues = found.some((f) => f.kind === "unknown-option" || f.kind === "type-error");
  if (o.partial || !stoppedOnValues) return found;

  const seen = new Set(found.map((f) => `${f.kind}|${f.option ?? f.message}`));
  const more = (await evaluate(target as Kind, roots, file, options)).filter(
    (f) => f.kind !== "warning" && !seen.has(`${f.kind}|${f.option ?? f.message}`),
  );
  return [...found, ...more];
}

export async function checkFile(file: string, o: Options): Promise<Result> {
  const text = await Bun.file(file).text();
  const { analysis, target, coverage, ...layer } = await staticLayer(text, o.target, o.version);
  let { items } = layer;
  // Nix rejects a file with no expression in it (empty, or only comments); the page does not, for an empty editor.
  if (!parse(text).ast && items.length === 0) {
    const eof = {
      severity: "error",
      code: "syntax-unexpected-eof",
      line: 1,
      col: 1,
      params: {},
    } as const;
    items.push(fromDiagnostic(eof));
  }

  // The real evaluation, unless the text does not even parse. A flake brings its own inputs.
  const broken = items.some((i) => i.level === "syntax" && i.severity === "error");
  // A nix.conf has no module system to evaluate: Nix reads it when it runs (see tools/oracle/nix-conf.ts).
  const evaluated = !broken && !o.static && target !== "nix-conf";
  if (evaluated) {
    const found = await nixFindings(target, file, analysis, o);
    for (const finding of found) {
      items.push(fromFinding(finding, await assignmentsOf(finding, file, analysis), file));
    }
    items = reconcile(items, true).items;
  }
  const origin = await provenance(catalogName(target as Target, o.version));
  return { file, target, version: o.version, evaluated, coverage, catalog: origin, items };
}
