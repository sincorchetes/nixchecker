import { extensionsFor } from "./extensions";
import { type Catalog, loadCatalog, loadExtension } from "./load";
import { addEntries } from "./tree";
import type { Target } from "./types";
import type { Version } from "./versions";

/**
 * The catalog of a target with, for NixOS, the options of every extension the paths write below (sops-nix,
 * agenix, impermanence): their entries are added to the tree, so their options are known and typed like
 * the others, and the source says where they come from.
 */
export async function loadExtended(
  target: Target,
  version: Version,
  base: string,
  paths: string[][],
  fetcher?: typeof fetch,
): Promise<Catalog> {
  const catalog = await loadCatalog(target, version, base, paths, fetcher);
  const found = await Promise.all(
    extensionsFor(target, paths).map((ext) => loadExtension(ext, base, paths, fetcher)),
  );
  for (const ext of found) addEntries(catalog.tree, ext.entries);
  return { ...catalog, source: [catalog.source, ...found.map((e) => e.source)].join(" + ") };
}
