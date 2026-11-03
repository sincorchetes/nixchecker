// Evaluates a flake with its own inputs: every NixOS and Home Manager configuration it defines, and, when
// asked, the packages, checks and development shells of the system this runs on.
import { dirname } from "node:path";
import { type Finding, parseEvaluation } from "../../src/lib/evaluation";

const FLAGS = [
  "--extra-experimental-features",
  "nix-command flakes",
  "--no-write-lock-file",
  "--log-format",
  "internal-json",
];

// The derivation of a configuration only evaluates when every assertion of it holds.
const CONFIGURATIONS = {
  nixosConfigurations: "config.system.build.toplevel.drvPath",
  homeConfigurations: "activationPackage.drvPath",
} as const;

// The outputs that are derivations for each system. Evaluating one is instantiating it: whatever is wrong
// in how it is written fails, but nothing is built, so a build that fails is not found.
const PER_SYSTEM = ["packages", "checks", "devShells"] as const;

async function nix(args: string[]): Promise<{ ok: boolean; out: string; err: string }> {
  const proc = Bun.spawn(["nix", ...args, ...FLAGS], { stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { ok: (await proc.exited) === 0, out, err };
}

// Nix copies the flake to the store and names that copy; the user knows the file they wrote.
export const original = (file: string | undefined, dir: string): string | undefined =>
  file?.replace(/^\/nix\/store\/[^/]+-source\//, `${dir}/`);

/**
 * The warnings and errors of every configuration of the flake `file` (and of its packages, checks and
 * development shells when `all`), tagged with the name of each.
 */
export async function evaluateFlake(path: string, all = false): Promise<Finding[]> {
  // The directory as Nix reads it: in a Git repository only the files Git tracks, as for `nix build`. (With
  // `path:` the whole directory, untracked files and secrets included, would be copied to the store.)
  const ref = dirname(path);
  const findings: Finding[] = [];
  const outputs: Array<[string, string]> = Object.entries(CONFIGURATIONS);
  if (all) {
    const system = (await nix(["eval", "--impure", "--raw", "--expr", "builtins.currentSystem"]))
      .out;
    for (const output of PER_SYSTEM) outputs.push([`${output}.${system}`, "drvPath"]);
  }
  for (const [output, derivation] of outputs) {
    const names = await nix([
      "eval",
      "--json",
      `${ref}#${output}`,
      "--apply",
      "builtins.attrNames",
    ]);
    // A flake without this output is not an error; one that does not even evaluate is.
    if (!names.ok) {
      if (!/does not provide attribute/.test(names.err))
        findings.push(...parseEvaluation(names.err));
      continue;
    }
    for (const name of JSON.parse(names.out) as string[]) {
      const run = await nix([
        "eval",
        "--raw",
        `${ref}#${output}.${JSON.stringify(name)}.${derivation}`,
      ]);
      for (const f of parseEvaluation(run.err)) {
        const file = original(f.file, dirname(path));
        findings.push({ ...f, ...(file && { file }), config: `${output}.${name}` });
      }
    }
  }
  return findings;
}
