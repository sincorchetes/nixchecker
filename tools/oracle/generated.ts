// Test modules made from the catalog itself: for a sample of its options, a handful of values of
// every kind. Nix says which of them the option takes, so the run can count separately what we
// reject that Nix accepts (false positives) and what Nix rejects that we accept (false negatives).
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { splitPath } from "../../src/lib/catalog/path";
import type { OptionRow } from "../../src/lib/catalog/types";

const catalogDir = join(import.meta.dir, "..", "..", "public", "catalog");

/** Values of each kind, written as Nix. */
export const VALUES = ["true", "1", '"x"', "[ ]", "{ }", "[ 1 ]", '[ "x" ]'];

// A small deterministic generator (mulberry32).
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The options of a catalog worth trying a value on: real, settable options with a type we check. */
export async function sampleOptions(name: string, count: number, seed: number): Promise<string[]> {
  const dir = join(catalogDir, name);
  const paths: string[] = [];
  for (const file of readdirSync(dir)) {
    if (file === "index.json") continue;
    const rows = (await Bun.file(join(dir, file)).json()) as OptionRow[];
    for (const [path, type, extra] of rows) {
      // A renamed option is tried whatever its own type says: its value is held to the type of the new one.
      if (!["hidden", "any", "set"].includes(type) || typeof extra === "string") paths.push(path);
      // An attribute set of something: also try a key below it, where its values are checked.
      if (type === "attrs" && Array.isArray(extra)) paths.push(`${path}.k`);
    }
  }
  paths.sort();
  const next = random(seed);
  const picked: string[] = [];
  for (let n = 0; n < count && paths.length > 0; n++) {
    picked.push(...paths.splice(Math.floor(next() * paths.length), 1));
  }
  return picked;
}

/**
 * Modules assigning each value to an option; names written `*` in the catalog become `x`. A disko
 * `nodev` takes its name as the place it mounts, so there it is `/x`: `x` would be rejected for that alone.
 */
export const modulesFor = (option: string): string[] => {
  const name = option.startsWith("disko.devices.nodev.*") ? "/x" : "x";
  const path = splitPath(option).map((seg) => {
    const written = seg === "*" ? name : seg;
    return /^[A-Za-z_][\w'-]*$/.test(written) ? written : JSON.stringify(written);
  });
  return VALUES.map((value) => `{ ${path.join(".")} = ${value}; }`);
};
