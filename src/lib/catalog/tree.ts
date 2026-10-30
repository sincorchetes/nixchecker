import { byName } from "../sort";
import type { IndexedOption } from "./load";

/** One path segment of the option tree; `*` children stand for any attribute name. */
export interface OptionTree {
  entry?: IndexedOption;
  /** Some non-hidden option sits at or below this node (so it is worth suggesting). */
  visible: boolean;
  /** Only some of its children are loaded (sharded catalogs), so it cannot list them all. */
  partial?: boolean;
  kids: Map<string, OptionTree>;
}

const node = (): OptionTree => ({ visible: false, kids: new Map() });

/** Builds the tree once per catalog, so lookups cost the path length, not the catalog size. */
export const emptyTree = node;

/** Adds entries to a tree; the first entry declared at a path wins. */
export function addEntries(root: OptionTree, entries: IndexedOption[]): OptionTree {
  for (const entry of entries) {
    let at = root;
    for (const seg of entry.segs) {
      let next = at.kids.get(seg);
      if (!next) {
        next = node();
        at.kids.set(seg, next);
      }
      if (entry.type !== "hidden") next.visible = true;
      at = next;
    }
    at.entry ??= entry;
  }
  return root;
}

export const buildTree = (entries: IndexedOption[]): OptionTree => addEntries(node(), entries);

// Children that can stand for `seg`: the literal one first, then the wildcard.
function step(at: OptionTree, seg: string): OptionTree[] {
  const found: OptionTree[] = [];
  const literal = at.kids.get(seg);
  if (literal) found.push(literal);
  const wildcard = at.kids.get("*");
  if (wildcard) found.push(wildcard);
  return found;
}

/** The option declared exactly at `path`. */
export function findExact(at: OptionTree, path: string[], i = 0): IndexedOption | undefined {
  if (i === path.length) return at.entry;
  for (const next of step(at, path[i] as string)) {
    const found = findExact(next, path, i + 1);
    if (found) return found;
  }
  return undefined;
}

/**
 * An option above `path` that cannot be checked any deeper (free-form set, opaque type, or an
 * alias whose children are unknown). The shortest one wins.
 */
export function findOwner(at: OptionTree, path: string[], i = 0): IndexedOption | undefined {
  if (i >= path.length) return undefined;
  const { entry } = at;
  if (entry && (entry.type === "attrs" || entry.type === "any" || entry.type === "hidden")) {
    return entry;
  }
  for (const next of step(at, path[i] as string)) {
    const found = findOwner(next, path, i + 1);
    if (found) return found;
  }
  return undefined;
}

/** Number of leading segments of `path` that lead to some known option. */
export function knownPrefix(at: OptionTree, path: string[], i = 0): number {
  if (i === path.length) return i;
  let best = i;
  for (const next of step(at, path[i] as string)) {
    best = Math.max(best, knownPrefix(next, path, i + 1));
    if (best === path.length) break;
  }
  return best;
}

/** Every visible path with as many segments as `path`, with `*` filled in from what was written. */
export function candidates(at: OptionTree, path: string[]): Set<string> {
  const found = new Set<string>();
  const walk = (here: OptionTree, i: number, acc: string) => {
    if (i === path.length) {
      found.add(acc);
      return;
    }
    for (const [seg, kid] of here.kids) {
      if (!kid.visible) continue;
      const name = seg === "*" ? (path[i] as string) : seg;
      walk(kid, i + 1, i === 0 ? name : `${acc}.${name}`);
    }
  };
  walk(at, 0, "");
  return found;
}

/**
 * Full paths that differ from `path` only in its first unknown segment (index `known`), for the
 * common case of a single typo. Far cheaper than comparing against every path of that length.
 */
export function siblings(at: OptionTree, path: string[], known: number): Set<string> {
  const found = new Set<string>();
  const walk = (here: OptionTree, i: number, acc: string[]) => {
    if (i < known) {
      for (const next of step(here, path[i] as string))
        walk(next, i + 1, [...acc, path[i] as string]);
      return;
    }
    for (const [seg, kid] of here.kids) {
      if (seg === "*" || !kid.visible) continue;
      const full = [...acc, seg, ...path.slice(known + 1)];
      if (knownPrefix(at, full) === full.length) found.add(full.join("."));
    }
  };
  walk(at, 0, []);
  return found;
}

/** Names that can follow `path`, as the catalog knows them (never `*`, never hidden-only). */
export function childrenOf(at: OptionTree, path: string[]): string[] {
  let here = [at];
  for (const seg of path) here = here.flatMap((node) => step(node, seg));
  const names = new Set<string>();
  for (const node of here) {
    if (node.partial) continue;
    for (const [name, kid] of node.kids) if (name !== "*" && kid.visible) names.add(name);
  }
  return [...names].sort(byName);
}

/**
 * Makes sure every root exists in the tree. With sharded catalogs a file that only names a root
 * (`programs = ...`) loads none of its shards, and the root would look unknown.
 */
export function addRoots(at: OptionTree, names: string[]): void {
  for (const name of names) {
    if (!at.kids.has(name)) at.kids.set(name, { visible: true, kids: new Map() });
  }
}
