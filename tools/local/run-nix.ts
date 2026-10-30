// Evaluates a module with the real module system of the Nix installed on this machine.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type Finding, parseEvaluation } from "../../src/lib/evaluation";
import { type Kind, type Roots, systemExpression } from "./expressions";

// Builds the derivation of the system: that only evaluates when every assertion of it holds.
const FORCE = "top";

/** The warnings and the error of evaluating the file `path` as a `kind` module. */
export async function evaluate(kind: Kind, roots: Roots, path: string): Promise<Finding[]> {
  const dir = await mkdtemp(join(tmpdir(), "nixchecker-local-"));
  try {
    const expression = join(dir, "eval.nix");
    await Bun.write(expression, systemExpression(kind, roots, "{ file }", FORCE));
    // The file is passed as the path it is, so its `imports` resolve next to it.
    const proc = Bun.spawn(
      [
        "nix-instantiate",
        "--eval",
        "--strict",
        "--json",
        "--arg",
        "file",
        resolve(path),
        expression,
      ],
      { stdout: "ignore", stderr: "pipe" },
    );
    const [output] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
    return parseEvaluation(output);
  } finally {
    await rm(dir, { recursive: true });
  }
}
