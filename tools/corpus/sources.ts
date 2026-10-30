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

import type { Version } from "../../src/lib/catalog/versions";

/** The nixpkgs and Home Manager of a release the site has catalogs for. */
export const releaseRoots = (version: Version): Promise<string[]> => {
  const name = version === "unstable" ? version : version.replace(".", "");
  return Promise.all([sourceRoot(`nixos-${name}`, 2), sourceRoot(`home-manager-${name}`, 1)]);
};

/** The disko repository, whose module is the one the catalog describes. */
export const diskoRoot = (): Promise<string> => sourceRoot("disko", 0);
