// Puts the modules in cases.ts to real Nix and to our validator, and fails when they disagree about
// unknown options or wrong types. Disagreements we accept on purpose are listed in KNOWN.
//   bun tools/oracle/run.ts            (needs Nix; `devenv shell -- oracle`)
import { sourceRoots } from "../corpus/sources";
import { CASES } from "./cases";
import { makeOracle } from "./nix";
import { judgeOurs } from "./ours";

// Where we are knowingly looser than Nix, with the reason.
const KNOWN = new Set<string>([
  // We read an option of type `str` as also taking a number, because the manuals show the final
  // type of coercing types (`either str int`); Nix refuses a number for a plain string.
  "{ time.timeZone = 3; }",
  // The elements of a list are not checked, only that it is a list.
  '{ networking.firewall.allowedTCPPorts = [ "ssh" ]; }',
  "{ nix.settings.max-jobs = [ 4 ]; }",
]);

type Judged = { unknown: boolean; typeError: boolean };
const agrees = (a: Judged, b: Judged) => a.unknown === b.unknown && a.typeError === b.typeError;

const [nixosRoot] = await sourceRoots();
const oracle = await makeOracle(nixosRoot as string);
const disagreements: string[] = [];
let broken = 0;
const WORKERS = 8;
let next = 0;
await Promise.all(
  Array.from({ length: WORKERS }, async () => {
    for (let i = next++; i < CASES.length; i = next++) {
      const source = CASES[i] as string;
      const ours = await judgeOurs(source);
      const real = await oracle.judge(source, ours.paths);
      if (real.other) {
        broken++;
        console.log(`  case does not evaluate (${real.other.trim()}): ${source}`);
      } else if (agrees(real, ours) && KNOWN.has(source)) {
        disagreements.push(`  now agrees, remove it from KNOWN: ${source}`);
      } else if (!agrees(real, ours) && !KNOWN.has(source)) {
        const say = (v: { unknown: boolean; typeError: boolean }) =>
          `${v.unknown ? "unknown" : ""}${v.typeError ? "type" : ""}` || "ok";
        disagreements.push(`  nix: ${say(real)}, we: ${say(ours)}: ${source}`);
      }
    }
  }),
);
await oracle.close();
console.log(
  `${CASES.length} modules judged, ${disagreements.length} disagreements, ${broken} broken`,
);
for (const line of disagreements.sort()) console.log(line);
if (disagreements.length > 0 || broken > 0) process.exit(1);
