// Evaluates a flake with its own inputs: every NixOS and Home Manager configuration it defines.
import { dirname } from "node:path";
import { type Finding, parseEvaluation } from "../../src/lib/evaluation";

const FLAGS = ["--extra-experimental-features", "nix-command flakes", "--no-write-lock-file"];

// The derivation of a configuration only evaluates when every assertion of it holds.
const DERIVATIONS = {
  nixosConfigurations: "config.system.build.toplevel.drvPath",
  homeConfigurations: "activationPackage.drvPath",
} as const;

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

/** The warnings and errors of every configuration of the flake `file`, tagged with its name. */
export async function evaluateFlake(path: string): Promise<Finding[]> {
  const ref = `path:${dirname(path)}`;
  const findings: Finding[] = [];
  for (const [output, derivation] of Object.entries(DERIVATIONS)) {
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
        findings.push({ ...f, ...(file && { file }), message: `${output}.${name}: ${f.message}` });
      }
    }
  }
  return findings;
}
