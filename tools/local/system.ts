// The system this machine's Nix builds for, as flakes name it (`x86_64-linux`).
import { SYSTEMS } from "../../src/lib/catalog/systems";

export async function currentSystem(): Promise<string> {
  const proc = Bun.spawn(
    ["nix-instantiate", "--eval", "--strict", "--json", "--expr", "builtins.currentSystem"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const out = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) throw new Error("could not ask Nix for its system");
  return JSON.parse(out) as string;
}

/** The system to evaluate for: the one asked for, else this machine's when we have a catalog for it. */
export async function systemFor(asked?: string): Promise<string> {
  if (asked) return asked;
  const own = await currentSystem();
  return (SYSTEMS as readonly string[]).includes(own) ? own : SYSTEMS[0];
}
