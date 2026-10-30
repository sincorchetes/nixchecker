// The pinned nixpkgs and Home Manager sources, as directories of .nix files (needs Nix).
import { realpath } from "node:fs/promises";
import { join } from "node:path";

const flakeDir = join(import.meta.dir, "..", "catalog");

// The whole repository a catalog bundle was read from: its `src` link points at the modules
// directory, which is `levels` directories below the root.
async function sourceRoot(attr: string, levels: number): Promise<string> {
  const proc = Bun.spawn(
    [
      "nix",
      "build",
      `${flakeDir}#${attr}`,
      "--no-link",
      "--print-out-paths",
      "--extra-experimental-features",
      "nix-command flakes",
    ],
    { stderr: "inherit" },
  );
  const out = (await new Response(proc.stdout).text()).trim();
  if ((await proc.exited) !== 0) throw new Error(`nix build ${attr} failed`);
  return join(await realpath(join(out, "src")), ...Array(levels).fill(".."));
}

export const sourceRoots = (): Promise<string[]> =>
  Promise.all([
    sourceRoot("nixos-unstable", 2), // nixpkgs/nixos/modules
    sourceRoot("home-manager-unstable", 1), // home-manager/modules
  ]);

/** The disko repository, whose module is the one the catalog describes. */
export const diskoRoot = (): Promise<string> => sourceRoot("disko", 0);
