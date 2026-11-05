// The system this machine's Nix builds for, as flakes name it (`x86_64-linux`).
import { isDarwin, SYSTEMS } from "../../src/lib/catalog/systems";
import { UsageError } from "./cli-args";

export async function currentSystem(): Promise<string> {
  const proc = Bun.spawn(
    ["nix-instantiate", "--eval", "--strict", "--json", "--expr", "builtins.currentSystem"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const out = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) throw new Error("could not ask Nix for its system");
  return JSON.parse(out) as string;
}

/**
 * The system to evaluate for. One asked for has to suit the target (a Mac for nix-darwin, Linux for the
 * rest); otherwise this machine's when it does, else the first of the family.
 */
export async function systemFor(
  asked: string | undefined,
  target: string,
  own: () => Promise<string> = currentSystem,
): Promise<string> {
  const darwin = target === "nix-darwin";
  if (asked) {
    if (isDarwin(asked) !== darwin) {
      throw new UsageError(`--system ${asked} does not suit ${target}`);
    }
    return asked;
  }
  const mine = await own();
  const family = SYSTEMS.filter((s) => isDarwin(s) === darwin);
  return (family as readonly string[]).includes(mine) ? mine : (family[0] as string);
}
