// Finds the options that nixpkgs and Home Manager rename, by reading their module sources.
// Renamed options are hidden from the manuals and carry no record of what replaced them.

// A list of plain strings: `[ "services" "foo" ]`. Anything with a variable or `${}` is skipped.
const STATIC_PATH = /^\s*(?:"[^"$\\]+"\s*)+$/;

const toPath = (list: string): string | undefined =>
  STATIC_PATH.test(list) ? [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]).join(".") : undefined;

const RENAMED = /mkRenamedOptionModule\s*\[([^\]]*)\]\s*\[([^\]]*)\]/g;
const RENAMED_WITH =
  /mkRenamedOptionModuleWith\s*\{[^}]*?\bfrom\s*=\s*\[([^\]]*)\][^}]*?\bto\s*=\s*\[([^\]]*)\]/g;

/** `{ "old.path": "new.path" }` for every static `mkRenamedOptionModule` in `source`. */
export function extractRenames(source: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const pattern of [RENAMED, RENAMED_WITH]) {
    for (const [, from, to] of source.matchAll(pattern)) {
      const oldPath = toPath(from as string);
      const newPath = toPath(to as string);
      if (oldPath && newPath && oldPath !== newPath) found[oldPath] = newPath;
    }
  }
  return found;
}
