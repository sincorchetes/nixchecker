// Finds out whether NixOS has a release that the site has no catalog for. `newerRelease` is the logic;
// the command below it reads the branch names that `.github/workflows/new-release.yml` lists.
import { VERSIONS } from "../../src/lib/catalog/versions";

const NIXPKGS = /^nixos-(\d{2})\.(\d{2})$/;
const HOME_MANAGER = /^release-(\d{2})\.(\d{2})$/;

// 26.05 as a number that sorts: the year, then the month.
const order = (release: string): number => {
  const [year, month] = release.split(".").map(Number) as [number, number];
  return year * 100 + month;
};

const releasesIn = (branches: string[], pattern: RegExp): string[] =>
  branches.flatMap((branch) => {
    const found = pattern.exec(branch.trim());
    return found ? [`${found[1]}.${found[2]}`] : [];
  });

export interface Newer {
  release: string;
  /** Whether Home Manager has the branch for it as well: until it does, there is nothing to build. */
  homeManager: boolean;
}

/**
 * The newest release nixpkgs has a branch for, if it is newer than every one in `known` (`unstable` and
 * anything else that is not a release is ignored).
 */
export function newerRelease(
  known: readonly string[],
  nixpkgs: string[],
  homeManager: string[],
): Newer | undefined {
  const have = Math.max(0, ...known.filter((v) => /^\d{2}\.\d{2}$/.test(v)).map(order));
  const newest = releasesIn(nixpkgs, NIXPKGS)
    .filter((release) => order(release) > have)
    .sort((a, b) => order(b) - order(a))[0];
  if (!newest) return undefined;
  return { release: newest, homeManager: releasesIn(homeManager, HOME_MANAGER).includes(newest) };
}

// The command: `bun tools/catalog/releases.ts nixpkgs-branches.txt home-manager-branches.txt`. It writes
// `release=26.11` and `home_manager=true` where a workflow reads outputs (GITHUB_OUTPUT), or to the
// terminal; nothing when there is no newer release.
if (import.meta.main) {
  const [nixpkgs, homeManager] = process.argv.slice(2);
  if (!nixpkgs || !homeManager) {
    console.error("usage: releases <nixpkgs branches file> <home-manager branches file>");
    process.exit(2);
  }
  const lines = async (path: string) => (await Bun.file(path).text()).split("\n");
  const found = newerRelease(VERSIONS, await lines(nixpkgs), await lines(homeManager));
  if (found) {
    const text = `release=${found.release}\nhome_manager=${found.homeManager}\n`;
    const out = process.env.GITHUB_OUTPUT;
    if (out)
      await Bun.write(
        out,
        (await Bun.file(out)
          .text()
          .catch(() => "")) + text,
      );
    else process.stdout.write(text);
  }
}
