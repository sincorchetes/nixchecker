// The names the catalog offers at a place in a file, for completing an option as it is typed.
import { join } from "node:path";
import { loadCatalog } from "../../src/lib/catalog";
import { childrenOf, findExact } from "../../src/lib/catalog/tree";
import type { CatalogIndex } from "../../src/lib/catalog/types";
import { catalogName, type Version } from "../../src/lib/catalog/versions";
import { byName } from "../../src/lib/sort";
import { analyze, resolveTarget, type TargetChoice } from "../../src/lib/validate";
import { fromDisk, publicDir } from "../local/static-layer";

export interface Candidate {
  name: string;
  /** What the option holds, when the name is an option and not a group of them. */
  detail?: string;
  group: boolean;
}

const LEAVES = new Set(["bool", "str", "int", "list", "enum", "path", "mix", "any"]);

/** The names that can follow `path` in the file `text`: options and groups, in order. */
export async function candidates(
  text: string,
  choice: string | undefined,
  version: Version,
  path: string[],
): Promise<Candidate[]> {
  const target = resolveTarget(analyze(text), (choice ?? "auto") as TargetChoice);
  const { tree } = await loadCatalog(target, version, "/", path.length > 0 ? [path] : [], fromDisk);
  const file = join(publicDir, "catalog", catalogName(target, version), "index.json");
  const index = (await Bun.file(file).json()) as CatalogIndex;

  // The tree only holds the shards loaded, so the roots, and the second names of a big root, come from
  // the index, which knows all of them.
  const big = path.length === 1 ? index.split[path[0] as string] : undefined;
  const names =
    path.length === 0 ? [...tree.kids.keys()] : big ? big.names : childrenOf(tree, path);
  return names
    .filter((name) => name !== "*")
    .sort(byName)
    .map((name) => {
      const entry = findExact(tree, [...path, name]);
      if (!entry || !LEAVES.has(entry.type)) return { name, group: true };
      const detail = entry.type === "enum" ? `enum(${entry.values?.join(" | ")})` : entry.type;
      return { name, detail, group: false };
    });
}
