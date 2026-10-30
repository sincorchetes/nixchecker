// The oracle: what the real NixOS module system says about a module, by evaluating it with Nix.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Verdict {
  /** Some option the module sets does not exist. */
  unknown: boolean;
  /** Some value does not fit the type of its option. */
  typeError: boolean;
  /** Any other failure, which means the case itself is broken. */
  other?: string;
}

const EXPRESSION = (root: string) => `{ file, path, deep }:
let
  ev = import (${JSON.stringify(root)} + "/nixos/lib/eval-config.nix") {
    system = "x86_64-linux";
    modules = [ file ];
  };
in
(if deep then builtins.deepSeq else builtins.seq) (builtins.foldl' (c: n: c.\${n}) ev.config path) true`;

/** Evaluates `config.<path>` of a NixOS system made from the module, and classifies the failure. */
async function force(
  expression: string,
  file: string,
  path: string[],
  deep: boolean,
): Promise<Verdict> {
  const proc = Bun.spawn(
    [
      "nix-instantiate",
      "--eval",
      "--strict",
      "--json",
      "--arg",
      "file",
      file,
      "--arg",
      "path",
      `[ ${path.map((p) => JSON.stringify(p)).join(" ")} ]`,
      "--arg",
      "deep",
      String(deep),
      expression,
    ],
    { stdout: "ignore", stderr: "pipe" },
  );
  const [errors, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  if (code === 0) return { unknown: false, typeError: false };
  if (/The options? .* (does|do) not exist/.test(errors))
    return { unknown: true, typeError: false };
  if (errors.includes("is not of type")) return { unknown: false, typeError: true };
  return {
    unknown: false,
    typeError: false,
    other: errors.split("\n").find((l) => l.includes("error:")) ?? errors,
  };
}

export async function makeOracle(root: string) {
  const dir = await mkdtemp(join(tmpdir(), "nixchecker-oracle-"));
  const expression = join(dir, "eval.nix");
  await Bun.write(expression, EXPRESSION(root));
  let counter = 0;

  return {
    /** The verdict for a module: every given path is forced, since types are only checked when read. */
    async judge(source: string, paths: string[][]): Promise<Verdict> {
      const file = join(dir, `case-${counter++}.nix`);
      await Bun.write(file, source);
      const verdict: Verdict = { unknown: false, typeError: false };
      for (const path of [["system", "name"], ...paths]) {
        // Deep first, so a wrong element is found; a group holds packages that cannot be forced
        // that way, and for it reading the value itself is as far as the check goes.
        let one = await force(expression, file, path, true);
        if (one.other) one = await force(expression, file, path, false);
        verdict.unknown ||= one.unknown;
        verdict.typeError ||= one.typeError;
        if (one.other && !verdict.other) verdict.other = one.other;
      }
      return verdict;
    },
    close: () => rm(dir, { recursive: true }),
  };
}
