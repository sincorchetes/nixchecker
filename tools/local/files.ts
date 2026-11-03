// The Nix files a run is about: the files named, and every .nix file under the directories named.
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

// Build outputs, dependencies and hidden directories hold no files of the user.
const SKIPPED = new Set(["node_modules", "result"]);

async function walk(dir: string, found: string[]): Promise<void> {
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (entry.name.startsWith(".") || SKIPPED.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, found);
    else if (entry.name.endsWith(".nix")) found.push(path);
  }
}

/** Thrown for a path that is not there, to be told to the person and not shown as a crash. */
export class MissingPath extends Error {}

export async function nixFiles(paths: string[]): Promise<string[]> {
  const found: string[] = [];
  for (const path of paths) {
    const info = await stat(path).catch(() => undefined);
    if (!info) throw new MissingPath(`no such file or directory: ${path}`);
    if (info.isDirectory()) await walk(path, found);
    else found.push(path);
  }
  return found;
}
