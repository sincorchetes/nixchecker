import { byName } from "../sort";
import { ancestors, splitPath } from "./path";
import { elementsOf, fromShape, type Shape } from "./shape";
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
  /**
   * Paths whose options the `entries` list in full: what the manuals document below them and the entries
   * do not have is dropped (the manuals can describe options a module does not declare).
   */
  authoritative?: string[];
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
// Names the manuals had to quote (`":pleroma"`) are written plainly, as the parser reads them.
const normalize = (name: string) => name.replace(/<[^<>]+>/g, "*").replace(/"([^".]*)"/g, "$1");

/**
 * Builds catalog entries from the manuals' `options.json`, the names of hidden options and
 * the overlay. Containers become strict `set`s when their children are listed, free-form
 * `attrs` otherwise.
 */
export function convert(
  options: Record<string, RawOption>,
  hidden: string[] = [],
  overlay: Overlay = {},
  shapes: Record<string, Shape> = {},
): OptionEntry[] {
  const entries = new Map<string, OptionEntry>();
  const containers = new Set<string>();

  for (const [name, option] of Object.entries(options)) {
    const path = normalize(name);
    // The real type from Nix when it tells something; the sentence of the manuals otherwise.
    const shape = shapes[name];
    const mapped = (shape && fromShape(shape)) || mapType(option.type);
    if (mapped.type === "container") containers.add(path);
    // What the values of an `attrsOf` may be, to check what is written below the option.
    const elements = shape && elementsOf(shape);
    const free = mapped.type === "container" || mapped.type === "attrs";
    const { type, values } = free && elements ? { ...mapped, values: elements } : mapped;
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
    roots.add(splitPath(path)[0] as string);
    for (const parent of ancestors(path)) documentedParents.add(parent);
  }
  for (const [from, to] of Object.entries(overlay.renamed ?? {})) {
    const current = entries.get(from);
    if ((current && current.type !== "hidden") || documentedParents.has(from)) continue;
    if (!roots.has(splitPath(from)[0] as string)) continue;
    entries.set(from, { path: from, type: entries.get(to)?.type ?? "any", renamedTo: to });
  }
  for (const entry of overlay.entries ?? []) {
    containers.delete(entry.path);
    entries.set(entry.path, entry);
  }
  const listed = new Set((overlay.entries ?? []).map((entry) => entry.path));
  for (const prefix of overlay.authoritative ?? []) {
    for (const path of [...entries.keys()]) {
      if (!path.startsWith(`${prefix}.`) || listed.has(path)) continue;
      entries.delete(path);
      containers.delete(path);
    }
  }

  const parents = new Set<string>();
  for (const path of entries.keys()) {
    for (const parent of ancestors(path)) parents.add(parent);
  }
  for (const path of containers) {
    const entry = entries.get(path) as OptionEntry;
    // A strict set lists what it holds: the kinds of values of its keys do not apply.
    if (parents.has(path)) {
      entries.set(path, {
        path,
        type: "set",
        ...(entry.renamedTo && { renamedTo: entry.renamedTo }),
      });
    }
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
