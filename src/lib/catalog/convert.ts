import { byName } from "../sort";
import type { OptionEntry, OptionRow, OptionType } from "./types";

/** An option as rendered in `options.json` by `nixosOptionsDoc`. */
export interface RawOption {
  type: string;
}

/** Hand-maintained corrections applied on top of what the manuals expose. */
export interface Overlay {
  /** Old option path -> replacement path. */
  renamed?: Record<string, string>;
  /** Entries that replace (or add to) the generated ones. */
  entries?: OptionEntry[];
}

interface Mapped {
  type: OptionType | "container";
  values?: string[];
}

// Text of `s` outside any parentheses.
function outsideParens(s: string): string {
  let depth = 0;
  let out = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (depth === 0) out += ch;
  }
  return out;
}

// "(foo)" -> "foo", but not "(foo) or (bar)".
function unwrap(s: string): string {
  return s.startsWith("(") && s.endsWith(")") && outsideParens(s) === "" ? s.slice(1, -1) : s;
}

/** Maps the type description of the manuals to the small set of types nixchecker checks. */
export function mapType(description: string): Mapped {
  const text = unwrap(description.trim().replace(/^null or /, ""));
  const flat = outsideParens(text);

  if (text.startsWith("one of ")) {
    const values = text
      .slice("one of ".length)
      .split(",")
      .map((v) => v.trim().replace(/^"(.*)"$/, "$1"));
    if (values.every((v) => /^-?\d+$/.test(v))) return { type: "int" };
    if (values.every((v) => v === "true" || v === "false")) return { type: "bool" };
    return { type: "enum", values };
  }
  // "A or B": the manuals cannot tell which one a given value must be, so do not guess.
  if (flat.includes(" or ")) return { type: "any" };
  if (flat === "boolean") return { type: "bool" };
  // Containers and lists come first: "list of integer" must not read as an integer.
  if (/^(non-empty )?list of/.test(flat)) return { type: "list" };
  // An open submodule takes any key, wherever the text mentions it ("DAG of open submodule of ...").
  if (/open submodule/.test(text)) return { type: "attrs" };
  if (
    /submodule|^(lazy )?attribute set|\b(JSON|TOML|YAML|INI|Java properties)\b.*value/.test(flat)
  ) {
    return { type: "container" };
  }
  if (/integer|^\d+ bit/.test(flat)) return { type: "int" };
  if (/string|absolute path|^path$/.test(flat)) return { type: "str" };
  return { type: "any" };
}

// `<[^<>]+>` and not `<[^>]+>`: a stray `<` must not make the match rescan the rest of the name.
const normalize = (name: string) => name.replace(/<[^<>]+>/g, "*");

/**
 * Builds catalog entries from the manuals' `options.json`, the names of hidden options and
 * the overlay. Containers become strict `set`s when their children are listed, free-form
 * `attrs` otherwise.
 */
export function convert(
  options: Record<string, RawOption>,
  hidden: string[] = [],
  overlay: Overlay = {},
): OptionEntry[] {
  const entries = new Map<string, OptionEntry>();
  const containers = new Set<string>();

  for (const [name, option] of Object.entries(options)) {
    const path = normalize(name);
    const { type, values } = mapType(option.type);
    if (type === "container") containers.add(path);
    entries.set(path, {
      path,
      type: type === "container" ? "attrs" : type,
      ...(values && { values }),
    });
  }
  for (const name of hidden) {
    const path = normalize(name);
    if (!entries.has(path)) entries.set(path, { path, type: "hidden" });
  }
  // A rename never replaces what the manuals document, nor a group that still has options below.
  // Renames inside submodules are written relative to them (`addr`), so only roots that exist count.
  const documentedParents = new Set<string>();
  const roots = new Set<string>();
  for (const path of entries.keys()) {
    const segs = path.split(".");
    roots.add(segs[0] as string);
    for (let n = 1; n < segs.length; n++) documentedParents.add(segs.slice(0, n).join("."));
  }
  for (const [from, to] of Object.entries(overlay.renamed ?? {})) {
    const current = entries.get(from);
    if ((current && current.type !== "hidden") || documentedParents.has(from)) continue;
    if (!roots.has(from.split(".")[0] as string)) continue;
    entries.set(from, { path: from, type: entries.get(to)?.type ?? "any", renamedTo: to });
  }
  for (const entry of overlay.entries ?? []) {
    containers.delete(entry.path);
    entries.set(entry.path, entry);
  }

  const parents = new Set<string>();
  for (const path of entries.keys()) {
    const segs = path.split(".");
    for (let n = 1; n < segs.length; n++) parents.add(segs.slice(0, n).join("."));
  }
  for (const path of containers) {
    const entry = entries.get(path) as OptionEntry;
    if (parents.has(path)) entries.set(path, { ...entry, type: "set" });
  }
  return [...entries.values()].sort((a, b) => byName(a.path, b.path));
}

/** Serializes an entry into the compact row format. */
export const toRow = (e: OptionEntry): OptionRow =>
  e.values
    ? [e.path, e.type, e.values]
    : e.renamedTo
      ? [e.path, e.type, e.renamedTo]
      : [e.path, e.type];
