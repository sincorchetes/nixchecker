import { splitPath } from "./path";
import { planner, shardFile } from "./shard";
import { addEntries, addRoots, emptyTree, type OptionTree } from "./tree";
import type { CatalogIndex, OptionEntry, OptionRow, Target } from "./types";
import { catalogName, type Version } from "./versions";

export interface IndexedOption extends OptionEntry {
  segs: string[];
}

export interface Catalog {
  source: string;
  entries: IndexedOption[];
  /** Holds the shards loaded so far; it grows as more are loaded. */
  tree: OptionTree;
}

/** Expands a compact row into an entry, split into path segments for fast matching. */
export function decodeRow([path, type, extra]: OptionRow): IndexedOption {
  const entry: IndexedOption = { path, type, segs: splitPath(path) };
  if (Array.isArray(extra)) entry.values = extra;
  else if (extra) entry.renamedTo = extra;
  return entry;
}

interface State {
  index: Promise<CatalogIndex>;
  plan?: (path: string[]) => string[];
  shards: Map<string, Promise<void>>;
  catalog: Catalog;
}

const states = new Map<string, State>();

async function getJson<T>(fetcher: typeof fetch, url: string): Promise<T> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

/**
 * Loads the part of a target's catalog that `paths` (the attribute paths of a file) need:
 * the small index plus only the shards they touch. Everything is kept, so later runs reuse
 * it; a failed download is not kept, so the next run retries.
 */
export async function loadCatalog(
  target: Target,
  version: Version,
  base: string,
  paths: string[][],
  fetcher: typeof fetch = fetch,
): Promise<Catalog> {
  const dir = `${base}catalog/${catalogName(target, version)}/`;
  let state = states.get(dir);
  if (!state) {
    const index = getJson<CatalogIndex>(fetcher, `${dir}index.json`);
    index.catch(() => states.delete(dir));
    state = { index, shards: new Map(), catalog: { source: "", entries: [], tree: emptyTree() } };
    states.set(dir, state);
  }
  const here = state;
  const index = await here.index;
  here.catalog.source = index.source;
  addRoots(
    here.catalog.tree,
    index.keys.map((key) => key.split("~")[0] as string),
  );
  here.plan ??= planner(index);
  const plan = here.plan;

  const load = (key: string) => {
    let pending = here.shards.get(key);
    if (!pending) {
      pending = getJson<OptionRow[]>(fetcher, `${dir}${shardFile(key)}`).then((rows) => {
        const entries = rows.map(decodeRow);
        here.catalog.entries.push(...entries);
        addEntries(here.catalog.tree, entries);
      });
      pending.catch(() => here.shards.delete(key));
      here.shards.set(key, pending);
    }
    return pending;
  };
  await Promise.all([...new Set(paths.flatMap(plan))].map(load));
  // Only some shards are loaded: neither the roots nor the split roots know all their children.
  const { tree } = here.catalog;
  tree.partial = true;
  for (const root of Object.keys(index.split)) {
    const node = tree.kids.get(root);
    if (node) node.partial = true;
  }
  return here.catalog;
}
