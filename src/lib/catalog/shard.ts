import { byName } from "../sort";
import { closest } from "../suggest";
import { toRow } from "./convert";
import type { CatalogIndex, OptionEntry, OptionRow } from "./types";

/** Roots with more options than this are split into buckets. */
export const SPLIT_LIMIT = 400;
/** Rows a bucket aims at: a download of a few KB, and not one file per service. */
export const BUCKET_ROWS = 300;

/** File name of a shard. */
export const shardFile = (key: string): string => `${key}.json`;

/** Bucket of a second segment (FNV-1a), the same on the build side and in the browser. */
export function bucketOf(name: string, buckets: number): number {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) hash = Math.imul(hash ^ name.charCodeAt(i), 16777619);
  return (hash >>> 0) % buckets;
}

/**
 * Cuts a catalog into shards so a file only downloads the parts it mentions. A root that
 * stays small is one shard (`networking`); a big one (`services`) is spread over buckets
 * keyed by its second segment (`services~12`), plus a shard under the bare root for the
 * options at that level.
 */
export function toShards(
  source: string,
  entries: OptionEntry[],
  limit = SPLIT_LIMIT,
  rows = BUCKET_ROWS,
): { index: CatalogIndex; shards: Record<string, OptionRow[]> } {
  const byRoot = new Map<string, OptionEntry[]>();
  for (const entry of entries) {
    const root = entry.path.split(".")[0] as string;
    byRoot.set(root, [...(byRoot.get(root) ?? []), entry]);
  }
  const shards: Record<string, OptionRow[]> = {};
  const split: CatalogIndex["split"] = {};
  const add = (key: string, entry: OptionEntry) => {
    shards[key] = [...(shards[key] ?? []), toRow(entry)];
  };
  for (const [root, list] of byRoot) {
    if (list.length <= limit) {
      for (const entry of list) add(root, entry);
      continue;
    }
    const buckets = Math.ceil(list.length / rows);
    const names = new Set<string>();
    for (const entry of list) {
      const segs = entry.path.split(".");
      if (segs.length === 1) {
        add(root, entry);
      } else {
        names.add(segs[1] as string);
        add(`${root}~${bucketOf(segs[1] as string, buckets)}`, entry);
      }
    }
    split[root] = { names: [...names].sort(byName), buckets };
  }
  return { index: { source, keys: Object.keys(shards).sort(byName), split }, shards };
}

/**
 * Decides which shards a path needs. A name that matches nothing falls back to the nearest
 * one, so the suggestion for a typo (`services.opnssh`) can still be found.
 */
export function planner(index: CatalogIndex): (path: string[]) => string[] {
  const keys = new Set(index.keys);
  const roots = new Set(index.keys.map((key) => key.split("~")[0] as string));
  return (path) => {
    const root = roots.has(path[0] as string) ? path[0] : closest(path[0] as string, roots);
    if (!root) return [];
    const found = keys.has(root) ? [root] : [];
    const big = index.split[root];
    const written = path[1];
    if (big && written !== undefined) {
      const second = big.names.includes(written)
        ? written
        : big.names.includes("*")
          ? "*"
          : closest(written, big.names);
      if (second) found.push(`${root}~${bucketOf(second, big.buckets)}`);
    }
    return found;
  };
}
