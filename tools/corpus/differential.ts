// Compares our parser with the official one (`nix-instantiate --parse`) on damaged copies of real
// files: for each, both must agree on whether the text is valid Nix. A sample of the corpus keeps
// it quick; the seed makes every run damage the same way.
//   bun tools/corpus/differential.ts [step] [seed] [k/n]   (needs Nix; `devenv shell -- differential`)
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lex } from "../../src/lib/nix/lex";
import { parse } from "../../src/lib/nix/parse";
import { sourceRoots } from "./sources";

const STEP = Number(process.argv[2] ?? 40); // one file out of this many
// `k/n` as the third argument: this run takes the k-th of n equal parts of those files, so that
// the canary can compare all of them in parallel jobs.
const [PART = 1, PARTS = 1] = (process.argv[4] ?? "1/1").split("/").map(Number);
if (!Number.isInteger(PART) || !Number.isInteger(PARTS) || PART < 1 || PART > PARTS) {
  throw new Error(`bad part "${process.argv[4]}": expected k/n with 1 <= k <= n`);
}
const WORKERS = 12;
const MAX_BYTES = 40_000;
const SYMBOLS = "{}[]()\";'=.$:@,?";

// A small deterministic generator (mulberry32).
let state = Number(process.argv[3] ?? 0x2545f491);
const random = () => {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (n: number) => Math.floor(random() * n);

// Words, single symbols and runs of whitespace: damage that respects the shape of the text.
const pieces = (s: string): string[] => s.match(/\w+|[^\w\s]|\s+/g) ?? [];
const words = (s: string): number[] => pieces(s).flatMap((p, i) => (/\S/.test(p) ? [i] : []));
const viaPieces =
  (change: (p: string[], at: number) => void) =>
  (s: string): string => {
    const p = pieces(s);
    const at = words(s)[pick(words(s).length)];
    if (at !== undefined) change(p, at);
    return p.join("");
  };

const damage: Array<(s: string) => string> = [
  (s) => s.slice(0, pick(s.length)), // cut off
  (s) => {
    const i = pick(s.length);
    return s.slice(0, i) + s.slice(i + 1); // lose a character
  },
  viaPieces((p, at) => p.splice(at, 1)), // lose a whole token
  viaPieces((p, at) => p.splice(at, 0, p[at] as string)), // say a token twice
  viaPieces((p, at) => {
    const next = p.findIndex((x, i) => i > at && /\S/.test(x));
    if (next > 0) [p[at], p[next]] = [p[next] as string, p[at] as string]; // swap neighbors
  }),
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
// Sorted, so that every runner splits the same list into the same parts.
const files: string[] = [];
for (const root of await sourceRoots()) {
  for await (const file of new Bun.Glob("**/*.nix").scan({ cwd: root, followSymlinks: true })) {
    files.push(join(root, file));
  }
}
files.sort();
for (const [index, file] of files.entries()) {
  if (index % STEP !== 0 || Math.floor(index / STEP) % PARTS !== PART - 1) continue;
  const text = await Bun.file(file).text();
  if (text.length > MAX_BYTES) continue;
  for (const change of damage) cases.push(change(text));
}

if (cases.length === 0) throw new Error("no files to damage: are the sources readable?");
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
