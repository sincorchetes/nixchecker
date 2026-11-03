// Evaluates a module with the real module system of the Nix installed on this machine.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type Finding, parseEvaluation } from "../../src/lib/evaluation";
import { type Kind, type Roots, systemExpression } from "./expressions";

// Builds the derivation of the system: that only evaluates when every assertion of it holds.
const WHOLE = "top";

// Reads the options the file sets, deeply or one level: types are only checked when a value is read,
// and the assertions of a system (root file system, boot loader) are never reached.
const PARTIAL = `let vals = map (p: builtins.foldl' (c: n: c.\${n}) config p) paths; in if deep then builtins.deepSeq vals true else builtins.all (v: builtins.seq v true) vals`;

// Which of the options the file sets fail to evaluate, one answer for each (a `throw`, which is what the
// module system does on a wrong value, is caught here; its message is not, and is asked for apart).
const PROBE = `let get = p: builtins.foldl' (c: n: c.\${n}) config p; in map (p: (builtins.tryEval (builtins.deepSeq (get p) true)).success) paths`;

// How many more failing options are asked about, after the first one Nix stopped at.
const MORE = 10;

// Something every system has, to read first: an unknown option is found by reading any of them.
const BASE: Record<Kind, string[]> = {
  nixos: ["system", "name"],
  "home-manager": ["home", "username"],
  disko: ["system", "name"],
};

const nixList = (paths: string[][]) =>
  `[ ${paths.map((p) => `[ ${p.map((s) => JSON.stringify(s)).join(" ")} ]`).join(" ")} ]`;

async function run(expression: string, args: string[]): Promise<string> {
  // The messages come as data (see `parseEvaluation`), not as text with colors and a trace.
  const flags = ["--eval", "--strict", "--json", "--log-format", "internal-json"];
  const proc = Bun.spawn(["nix-instantiate", ...flags, ...args, expression], {
    stdout: "ignore",
    stderr: "pipe",
  });
  const [output] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  return output;
}

// For each path, whether it evaluates (the first answer is for the base one, which every system has).
async function probe(expression: string, args: string[]): Promise<boolean[]> {
  const proc = Bun.spawn(["nix-instantiate", "--eval", "--strict", "--json", ...args, expression], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const [out] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  try {
    return JSON.parse(out) as boolean[];
  } catch {
    return [];
  }
}

/**
 * The warnings and the error of evaluating the file `path` as a `kind` module. With `options` (the
 * paths of the options it sets) the file is not taken for a whole system: only those are read.
 */
export async function evaluate(
  kind: Kind,
  roots: Roots,
  path: string,
  options?: string[][],
): Promise<Finding[]> {
  const dir = await mkdtemp(join(tmpdir(), "nixchecker-local-"));
  try {
    const expression = join(dir, "eval.nix");
    // The file is passed as the path it is, so its `imports` resolve next to it.
    const file = ["--arg", "file", resolve(path)];
    if (!options) {
      await Bun.write(expression, systemExpression(kind, roots, "{ file }", WHOLE));
      return parseEvaluation(await run(expression, file));
    }
    await Bun.write(expression, systemExpression(kind, roots, "{ file, paths, deep }", PARTIAL));
    const probing = join(dir, "probe.nix");
    await Bun.write(probing, systemExpression(kind, roots, "{ file, paths }", PROBE));

    // The base option leads the first read, to find options that do not exist. Later ones leave it out:
    // it can depend on the very option that failed, and would hide the others.
    const read = async (list: string[][], withBase = true) => {
      const paths = nixList(withBase ? [BASE[kind], ...list] : list);
      const go = (deep: boolean) =>
        run(expression, [...file, "--arg", "paths", paths, "--arg", "deep", String(deep)]);
      // A group holds packages that cannot be read deeply: then one level is as far as the check goes.
      const deep = parseEvaluation(await go(true));
      const settled = deep.some((f) => f.kind === "unknown-option" || f.kind === "type-error");
      return settled || !deep.some((f) => f.kind === "error")
        ? deep
        : parseEvaluation(await go(false));
    };
    const found = await read(options);
    // Nix stops at the first wrong value. The other options of the file that fail are found out apart,
    // and each is asked for its own message. (An option that does not exist stops everything alike.)
    if (!found.some((f) => f.kind === "type-error")) return found;

    const reported = new Set(found.map((f) => f.option));
    const answers = await probe(probing, [
      ...file,
      "--arg",
      "paths",
      nixList([BASE[kind], ...options]),
    ]);
    const more: Finding[] = [];
    for (const [n, path] of options.entries()) {
      if (answers[n + 1] !== false || more.length >= MORE) continue;
      for (const finding of await read([path], false)) {
        const key = finding.option ?? finding.message;
        if (finding.kind === "warning" || reported.has(key)) continue;
        reported.add(key);
        more.push(finding);
      }
    }
    return [...found, ...more];
  } finally {
    await rm(dir, { recursive: true });
  }
}
