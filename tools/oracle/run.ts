// Puts modules to real Nix (the NixOS module system) and to our validator, and fails when they
// disagree about unknown options or wrong types. Two sets: the hand-written cases in cases.ts, and
// modules generated from a sample of the catalog, counted as false positives and false negatives.
//   bun tools/oracle/run.ts [options to sample] [seed]   (needs Nix; `devenv shell -- oracle`)
import { sourceRoots } from "../corpus/sources";
import { CASES } from "./cases";
import { modulesFor, sampleOptions } from "./generated";
import { makeOracle, type Verdict } from "./nix";
import { judgeOurs } from "./ours";

// Where we are knowingly looser than Nix, with the reason.
const KNOWN = new Set<string>([
  // A string type renamed in its module (`kernelParam`) is only known by its new name, and a type that
  // wraps an unlisted name stays unchecked; building its original name back is not always possible.
  '{ boot.kernelParams = [ "quiet" 5 ]; }',
]);
const SAMPLE = Number(process.argv[2] ?? 40);
const SEED = Number(process.argv[3] ?? 1);
// The share of wrong values Nix rejects that we may let through (what is not checked is not wrong).
const MAX_MISSED = 0.15;

type Judged = Pick<Verdict, "unknown" | "typeError">;
const agrees = (a: Judged, b: Judged) => a.unknown === b.unknown && a.typeError === b.typeError;
const say = (v: Judged) => `${v.unknown ? "unknown" : ""}${v.typeError ? "type" : ""}` || "ok";

const [nixosRoot] = await sourceRoots();
const oracle = await makeOracle(nixosRoot as string);

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

// 1. The cases written by hand: every disagreement counts.
await each(CASES, async (source) => {
  const ours = await judgeOurs(source);
  const real = await oracle.judge(source, ours.paths);
  if (real.other) problems.push(`  case does not evaluate (${real.other.trim()}): ${source}`);
  else if (agrees(real, ours) && KNOWN.has(source)) {
    problems.push(`  now agrees, remove it from KNOWN: ${source}`);
  } else if (!agrees(real, ours) && !KNOWN.has(source)) {
    problems.push(`  nix: ${say(real)}, we: ${say(ours)}: ${source}`);
  }
});

// 2. Modules made from the catalog: a false positive is a failure, a miss is counted.
const options = await sampleOptions("nixos-unstable", SAMPLE, SEED);
const generated = options.flatMap(modulesFor);
let falsePositives = 0;
let missed = 0;
let wrong = 0;
await each(generated, async (source) => {
  const ours = await judgeOurs(source);
  const real = await oracle.judge(source, ours.paths);
  if (real.other || real.unknown) return; // not a question about types
  if (real.typeError) wrong++;
  if (ours.typeError && !real.typeError) {
    falsePositives++;
    problems.push(`  false positive (we reject, Nix takes it): ${source}`);
  } else if (real.typeError && !ours.typeError) {
    missed++;
  }
});
await oracle.close();

console.log(
  `${CASES.length} written modules, ${generated.length} generated from ${options.length} options:`,
  `${falsePositives} false positives, ${missed} of ${wrong} wrong values let through`,
);
for (const line of problems.sort()) console.log(line);
const missedShare = wrong === 0 ? 0 : missed / wrong;
if (missedShare > MAX_MISSED)
  console.log(`  too many wrong values let through (${missedShare.toFixed(2)})`);
if (problems.length > 0 || missedShare > MAX_MISSED) process.exit(1);
