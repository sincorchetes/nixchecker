export type Target = "nixos" | "home-manager" | "disko" | "flake";

/**
 * - `attrs`: a free-form set; any path below it is accepted.
 * - `set`: a set whose children are all listed in the catalog (e.g. `users.users.<name>`).
 * - `mix`: takes a value of any of the kinds in `values` (`signed integer or string`).
 * - `any`: a type the manuals cannot describe precisely; nothing about it is checked, and
 *   any path below it is accepted.
 * - `hidden`: exists upstream but is hidden from the manuals (alias, renamed or removed);
 *   using it only warns.
 */
export type OptionType =
  | "bool"
  | "str"
  | "int"
  | "list"
  | "attrs"
  | "set"
  | "enum"
  | "mix"
  | "any"
  | "hidden";

export interface OptionEntry {
  /** Dotted path; `*` stands for any attribute name (submodules, attrsOf). */
  path: string;
  type: OptionType;
  /** Allowed values for "enum"; the allowed kinds for "mix" and for the elements of a "list". */
  values?: string[];
  /** Set when the option was renamed: validating it yields a deprecation warning. */
  renamedTo?: string;
}

/**
 * Compact on-disk form of an entry: `[path, type]`, `[path, "enum", values]`
 * or `[path, type, renamedTo]`. Catalogs hold tens of thousands of them.
 */
export type OptionRow = [path: string, type: OptionType, extra?: string[] | string];

/**
 * What `catalog/<target>/index.json` holds. The options live in shards, one file per root
 * (`networking`) or, for the big roots, per root and bucket of second segments (`services~12`).
 */
export interface CatalogIndex {
  /** Human-readable origin, e.g. "nixpkgs-unstable · 31ecbac · 2026-10-27". */
  source: string;
  /** Every shard that exists. */
  keys: string[];
  /** For the big roots: their second segments (`*` for any name) and how many buckets they use. */
  split: Record<string, { names: string[]; buckets: number }>;
}

/** Compact constructor for hand-written entries (overlays and test fixtures). */
export const opt = (
  path: string,
  type: OptionType,
  extra: Omit<OptionEntry, "path" | "type"> = {},
): OptionEntry => ({ path, type, ...extra });
