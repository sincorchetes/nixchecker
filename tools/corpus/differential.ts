// Compares our parser with the official one (`nix-instantiate --parse`) on damaged copies of real
// files: for each, both must agree on whether the text is valid Nix. A sample of the corpus keeps
// it quick; the seed makes every run damage the same way.
//   bun tools/corpus/differential.ts [step]   (needs Nix; `devenv shell -- differential`)
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lex } from "../../src/lib/nix/lex";
import { parse } from "../../src/lib/nix/parse";
import { sourceRoots } from "./sources";

const STEP = Number(process.argv[2] ?? 40); // one file out of this many
const WORKERS = 12;
const MAX_BYTES = 40_000;
const SYMBOLS = "{}[]()\";'=.$:@,?";

// A small deterministic generator (mulberry32).
let state = 0x2545f491;
const random = () => {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (n: number) => Math.floor(random() * n);

const damage: Array<(s: string) => string> = [
  (s) => s.slice(0, pick(s.length)), // cut off
  (s) => {
    const i = pick(s.length);
    return s.slice(0, i) + s.slice(i + 1); // lose a character
  },
  (s) => {
    const i = pick(s.length);
    return s.slice(0, i) + (SYMBOLS[pick(SYMBOLS.length)] ?? "") + s.slice(i); // add a symbol
  },
];

// The official verdict on the syntax. It also reports things that are not syntax (an undefined
// variable, a path with a trailing slash...): the first is a later step our scanner does apart from
// the parser and so counts as valid text, the rest are left out of the comparison.
const officialVerdict = async (path: string): Promise<"valid" | "invalid" | "other"> => {
  const proc = Bun.spawn(["nix-instantiate", "--parse", path], {
    stdout: "ignore",
    stderr: "pipe",
  });
  const [errors, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  if (code === 0 || errors.includes("undefined variable")) return "valid";
  return errors.includes("syntax error") ? "invalid" : "other";
};

const dir = await mkdtemp(join(tmpdir(), "nixchecker-diff-"));
const cases: string[] = [];
let index = 0;
for (const root of await sourceRoots()) {
  for await (const file of new Bun.Glob("**/*.nix").scan({ cwd: root, followSymlinks: true })) {
    if (index++ % STEP !== 0) continue;
    const text = await Bun.file(join(root, file)).text();
    if (text.length > MAX_BYTES) continue;
    for (const change of damage) cases.push(change(text));
  }
}

const disagreements: string[] = [];
let next = 0;
await Promise.all(
  Array.from({ length: WORKERS }, async (_, worker) => {
    for (let i = next++; i < cases.length; i = next++) {
      const text = cases[i] as string;
      const path = join(dir, `${worker}.nix`);
      await Bun.write(path, text);
      const official = await officialVerdict(path);
      if (official === "other") continue;
      // Nothing but whitespace and comments: the page asks for some Nix instead of judging it.
      if (lex(text).tokens.length === 0) continue;
      const ours = parse(text).problems.length === 0;
      if ((official === "valid") !== ours) {
        const kept = join(dir, `case-${i}.nix`);
        await Bun.write(kept, text);
        disagreements.push(
          `${kept}: nix ${official === "valid" ? "accepts" : "rejects"}, we ${ours ? "accept" : "reject"}`,
        );
      }
    }
  }),
);

console.log(`${cases.length} damaged files compared, ${disagreements.length} disagreements`);
for (const line of disagreements.slice(0, 20)) console.log(`  ${line}`);
if (disagreements.length > 0) process.exit(1);
await rm(dir, { recursive: true });
