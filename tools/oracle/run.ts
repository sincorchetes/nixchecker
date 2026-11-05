// Puts modules to real Nix (the NixOS, Home Manager and disko module systems) and to our validator,
// and fails when they disagree about unknown options or wrong types. Two sets for each: the
// hand-written cases, and modules generated from a sample of the catalog, counted as false positives
// and as wrong values let through.
//   bun tools/oracle/run.ts [options to sample] [seed] [all] [renamed]   (needs Nix; `devenv shell -- oracle`)
// `renamed` samples only the options that were renamed, whose values are held to the type of the new name.
// Many of those new names are free-form or not in the catalogs, so what is let through is not held to the
// share there: that run is for the false positives.
// ORACLE_MISSES=1 lists every wrong value we let through.

import { EXTENSIONS, extensionCatalog } from "../../src/lib/catalog/extensions";
import { DEFAULT_SYSTEM } from "../../src/lib/catalog/systems";
import { VERSIONS, type Version } from "../../src/lib/catalog/versions";
import { bundleOut, darwinRoot, diskoRoot, releaseRoots } from "../corpus/sources";
import { CASES } from "./cases";
import { EXTENSION_CASES } from "./cases-extensions";
import { DARWIN_CASES, DISKO_CASES, HOME_MANAGER_CASES } from "./cases-other";
import { modulesFor, sampleOptions } from "./generated";
import { type Kind, makeOracle, type Verdict } from "./nix";
import { judgeOurs } from "./ours";

// Where we are knowingly looser than Nix, with the reason.
const KNOWN = new Set<string>([
  // A string type renamed in its module (`kernelParam`) is only known by its new name, and a type that
  // wraps an unlisted name stays unchecked; building its original name back is not always possible.
  '{ boot.kernelParams = [ "quiet" 5 ]; }',
  // What a disko `content` holds depends on its `type`; the catalog only knows it is a free-form set.
  '{ disko.devices.disk.main = { type = "disk"; device = "/dev/sda"; content = { type = "gpt"; partitions.root = { size = "100%"; content = { type = "filesystem"; format = "ext4"; mountpoin = "/"; }; }; }; }; }',
]);
const SAMPLE = Number(process.argv[2] ?? 40);
const SEED = Number(process.argv[3] ?? 1);
// The share of wrong values Nix rejects that we may let through (what is not checked is not wrong). What
// is let through are values narrowed in ways the catalogs do not hold: types with a check of their own that
// runs when the definitions are merged (`ibus.engines`, `kanshi` directives, a launchd calendar interval that
// must not be empty), and the patterns of disko (which it serializes as plain strings). With 600 options per
// catalog (`oracle 600 11`) that is under 0.3 % in NixOS, Home Manager and nix-darwin; a small sample of disko
// can show one as over the share.
const MAX_MISSED = 0.02;

// `all` runs every release the site has catalogs for; the default is the development branch.
const FLAGS = process.argv.slice(4);
const RELEASES: readonly Version[] = FLAGS.includes("all") ? VERSIONS : ["unstable"];

interface Target {
  kind: Kind;
  version: Version;
  cases: string[];
  catalog: string;
  /** The module of an extension, which NixOS is given. */
  module?: string;
}
// disko is not versioned: it is evaluated against the development nixpkgs, once.
const TARGETS: Target[] = RELEASES.flatMap((version) => [
  { kind: "nixos" as const, version, cases: CASES, catalog: `nixos-${version}` },
  {
    kind: "home-manager" as const,
    version,
    cases: HOME_MANAGER_CASES,
    catalog: `home-manager-${version}`,
  },
  {
    kind: "nix-darwin" as const,
    version,
    cases: DARWIN_CASES,
    catalog: `nix-darwin-${version}`,
  },
  ...(version === "unstable"
    ? [{ kind: "disko" as const, version, cases: DISKO_CASES, catalog: "disko" }]
    : []),
]);

// The modules of other projects, evaluated with the development nixpkgs like disko.
if (RELEASES.includes("unstable")) {
  for (const ext of EXTENSIONS) {
    const out = await bundleOut(extensionCatalog(ext));
    TARGETS.push({
      kind: ext.target === "home-manager" ? "home-manager" : "nixos",
      version: "unstable",
      cases: EXTENSION_CASES[extensionCatalog(ext)] ?? [],
      catalog: extensionCatalog(ext),
      module: (await Bun.file(`${out}/module-path`).text()).trim(),
    });
  }
}

type Judged = Pick<Verdict, "unknown" | "typeError">;
const agrees = (a: Judged, b: Judged) => a.unknown === b.unknown && a.typeError === b.typeError;
const say = (v: Judged) => `${v.unknown ? "unknown" : ""}${v.typeError ? "type" : ""}` || "ok";

const disko = await diskoRoot();
async function rootsOf(version: Version, kind: Kind, module?: string) {
  const [nixpkgs, homeManager] = await releaseRoots(version);
  return {
    nixpkgs: nixpkgs as string,
    homeManager: homeManager as string,
    disko,
    ...(module && { modules: [module] }),
    nixDarwin: kind === "nix-darwin" ? await darwinRoot(version) : "",
    system: kind === "nix-darwin" ? "aarch64-darwin" : DEFAULT_SYSTEM,
  };
}

// Runs `work` over the items with a few at a time.
async function each<T>(items: T[], work: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let i = next++; i < items.length; i = next++) await work(items[i] as T);
    }),
  );
}

const problems: string[] = [];
let tooLoose = false;

for (const { kind, version, cases, catalog, module } of TARGETS) {
  const oracle = await makeOracle(kind, await rootsOf(version, kind, module));
  const name = module ? catalog : kind === "disko" ? kind : `${kind} ${version}`;
  const judge = async (source: string) => {
    const ours = await judgeOurs(source, kind, version);
    return { ours, real: await oracle.judge(source, ours.paths) };
  };

  // 1. The cases written by hand: every disagreement counts.
  await each(cases, async (source) => {
    const { ours, real } = await judge(source);
    if (real.other) {
      problems.push(`  ${name}: case does not evaluate (${real.other.trim()}): ${source}`);
    } else if (agrees(real, ours) && KNOWN.has(source)) {
      problems.push(`  now agrees, remove it from KNOWN: ${source}`);
    } else if (!agrees(real, ours) && !KNOWN.has(source)) {
      problems.push(`  ${name}: nix says ${say(real)}, we say ${say(ours)}: ${source}`);
    }
  });

  // 2. Modules made from the catalog: a false positive is a failure, a miss is counted.
  const options = await sampleOptions(catalog, SAMPLE, SEED, FLAGS.includes("renamed"));
  const generated = options.flatMap(modulesFor);
  let falsePositives = 0;
  let missed = 0;
  let wrong = 0;
  await each(generated, async (source) => {
    const { ours, real } = await judge(source);
    if (real.other || real.unknown) return; // not a question about types
    // Read one level only, and no type error seen: the elements were not looked at, so it says nothing.
    if (real.shallow && !real.typeError) return;
    if (real.typeError) wrong++;
    if (ours.typeError && !real.typeError) {
      falsePositives++;
      problems.push(`  ${name}: false positive (we reject, Nix takes it): ${source}`);
    } else if (real.typeError && !ours.typeError) {
      missed++;
      if (process.env.ORACLE_MISSES) console.log(`  miss ${name}: ${source}`);
    }
  });
  await oracle.close();

  const share = wrong === 0 ? 0 : missed / wrong;
  tooLoose ||= !FLAGS.includes("renamed") && share > MAX_MISSED;
  console.log(
    `${name}: ${cases.length} written modules, ${generated.length} generated from ${options.length} options:`,
    `${falsePositives} false positives, ${missed} of ${wrong} wrong values let through`,
  );
}

for (const line of problems.sort()) console.log(line);
if (tooLoose) console.log(`  too many wrong values let through (over ${MAX_MISSED})`);
if (problems.length > 0 || tooLoose) process.exit(1);
