// Puts modules to real Nix (the NixOS, Home Manager and disko module systems) and to our validator,
// and fails when they disagree about unknown options or wrong types. Two sets for each: the
// hand-written cases, and modules generated from a sample of the catalog, counted as false positives
// and as wrong values let through.
//   bun tools/oracle/run.ts [options to sample] [seed]   (needs Nix; `devenv shell -- oracle`)
import { diskoRoot, sourceRoots } from "../corpus/sources";
import { CASES } from "./cases";
import { DISKO_CASES, HOME_MANAGER_CASES } from "./cases-other";
import { modulesFor, sampleOptions } from "./generated";
import { type Kind, makeOracle, type Verdict } from "./nix";
import { judgeOurs } from "./ours";

// Where we are knowingly looser than Nix, with the reason.
const KNOWN = new Set<string>([
  // A string type renamed in its module (`kernelParam`) is only known by its new name, and a type that
  // wraps an unlisted name stays unchecked; building its original name back is not always possible.
  '{ boot.kernelParams = [ "quiet" 5 ]; }',
  // The values of an attribute set whose elements have a type (`attrsOf`) are not checked yet.
  '{ home.sessionVariables.EDITOR = [ "vim" ]; }',
  // What a disko `content` holds depends on its `type`; the catalog only knows it is a free-form set.
  '{ disko.devices.disk.main = { type = "disk"; device = "/dev/sda"; content = { type = "gpt"; partitions.root = { size = "100%"; content = { type = "filesystem"; format = "ext4"; mountpoin = "/"; }; }; }; }; }',
]);
const SAMPLE = Number(process.argv[2] ?? 40);
const SEED = Number(process.argv[3] ?? 1);
// The share of wrong values Nix rejects that we may let through (what is not checked is not wrong).
const MAX_MISSED = 0.15;

const TARGETS: Array<{ kind: Kind; cases: string[]; catalog: string }> = [
  { kind: "nixos", cases: CASES, catalog: "nixos-unstable" },
  { kind: "home-manager", cases: HOME_MANAGER_CASES, catalog: "home-manager-unstable" },
  { kind: "disko", cases: DISKO_CASES, catalog: "disko" },
];

type Judged = Pick<Verdict, "unknown" | "typeError">;
const agrees = (a: Judged, b: Judged) => a.unknown === b.unknown && a.typeError === b.typeError;
const say = (v: Judged) => `${v.unknown ? "unknown" : ""}${v.typeError ? "type" : ""}` || "ok";

const [nixpkgs, homeManager] = await sourceRoots();
const roots = {
  nixpkgs: nixpkgs as string,
  homeManager: homeManager as string,
  disko: await diskoRoot(),
};

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

for (const { kind, cases, catalog } of TARGETS) {
  const oracle = await makeOracle(kind, roots);
  const judge = async (source: string) => {
    const ours = await judgeOurs(source, kind);
    return { ours, real: await oracle.judge(source, ours.paths) };
  };

  // 1. The cases written by hand: every disagreement counts.
  await each(cases, async (source) => {
    const { ours, real } = await judge(source);
    if (real.other) {
      problems.push(`  ${kind}: case does not evaluate (${real.other.trim()}): ${source}`);
    } else if (agrees(real, ours) && KNOWN.has(source)) {
      problems.push(`  now agrees, remove it from KNOWN: ${source}`);
    } else if (!agrees(real, ours) && !KNOWN.has(source)) {
      problems.push(`  ${kind}: nix says ${say(real)}, we say ${say(ours)}: ${source}`);
    }
  });

  // 2. Modules made from the catalog: a false positive is a failure, a miss is counted.
  const options = await sampleOptions(catalog, SAMPLE, SEED);
  const generated = options.flatMap(modulesFor);
  let falsePositives = 0;
  let missed = 0;
  let wrong = 0;
  await each(generated, async (source) => {
    const { ours, real } = await judge(source);
    if (real.other || real.unknown) return; // not a question about types
    if (real.typeError) wrong++;
    if (ours.typeError && !real.typeError) {
      falsePositives++;
      problems.push(`  ${kind}: false positive (we reject, Nix takes it): ${source}`);
    } else if (real.typeError && !ours.typeError) {
      missed++;
    }
  });
  await oracle.close();

  const share = wrong === 0 ? 0 : missed / wrong;
  tooLoose ||= share > MAX_MISSED;
  console.log(
    `${kind}: ${cases.length} written modules, ${generated.length} generated from ${options.length} options:`,
    `${falsePositives} false positives, ${missed} of ${wrong} wrong values let through`,
  );
}

for (const line of problems.sort()) console.log(line);
if (tooLoose) console.log(`  too many wrong values let through (over ${MAX_MISSED})`);
if (problems.length > 0 || tooLoose) process.exit(1);
