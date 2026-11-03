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
const PARTIAL =
  "let vals = map (p: builtins.foldl' (c: n: c.${n}) config p) paths; in if deep then builtins.deepSeq vals true else builtins.all (v: builtins.seq v true) vals";

// Something every system has, to read first: an unknown option is found by reading any of them.
const BASE: Record<Kind, string[]> = {
  nixos: ["system", "name"],
  "home-manager": ["home", "username"],
  disko: ["system", "name"],
};

const nixList = (paths: string[][]) =>
  `[ ${paths.map((p) => `[ ${p.map((s) => JSON.stringify(s)).join(" ")} ]`).join(" ")} ]`;

async function run(expression: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["nix-instantiate", "--eval", "--strict", "--json", ...args, expression], {
    stdout: "ignore",
    stderr: "pipe",
  });
  const [output] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  return output;
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
    const paths = nixList([BASE[kind], ...options]);
    const read = (deep: boolean) =>
      run(expression, [...file, "--arg", "paths", paths, "--arg", "deep", String(deep)]);
    // A group holds packages that cannot be read deeply: then one level is as far as the check goes.
    const deep = parseEvaluation(await read(true));
    const settled = deep.some((f) => f.kind === "unknown-option" || f.kind === "type-error");
    return settled || !deep.some((f) => f.kind === "error")
      ? deep
      : parseEvaluation(await read(false));
  } finally {
    await rm(dir, { recursive: true });
  }
}
