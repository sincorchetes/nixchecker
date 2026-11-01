import type { SkipCause } from "./analysis";
import type { IndexedOption, OptionTree } from "./catalog";
import { knownPrefix } from "./catalog/tree";
import type { Assignment } from "./nix/scan";

/** Why the catalog entry cannot judge this value, if it cannot: dynamic, `any`, or interpolated. */
export function skipReason(entry: IndexedOption, a: Assignment): SkipCause | undefined {
  if (a.kind === "other") return "dynamic";
  if (entry.type === "hidden") return "hidden";
  if (entry.type === "any") return "any";
  const interpolated = entry.type === "enum" && a.kind === "str" && a.value === undefined;
  return interpolated ? "interpolated" : undefined;
}

// Why a value below an option with no entry of its own is not checked: that option is hidden,
// free-form, or not read to the depth of the value.
export function ownerReason(owner: IndexedOption, a: Assignment): SkipCause | undefined {
  if (owner.type === "hidden") return "hidden";
  const read = owner.values && a.path.length === owner.segs.length + 1 && a.kind !== "other";
  return read ? undefined : "free-form";
}

// A path that is a known group of options (`services.openssh`) rather than an option itself.
export const isGroup = (tree: OptionTree, path: string[]): boolean =>
  knownPrefix(tree, path) === path.length;

// A list written out in full whose elements are of a kind its option does not take.
function wrongElements(entry: IndexedOption, a: Assignment): string | undefined {
  const allowed = entry.values;
  const wrong = allowed && a.items?.some((kind) => kind !== "other" && !allowed.includes(kind));
  return wrong ? `list of ${allowed.join(" | ")}` : undefined;
}

const describeKind = (kind: string): string =>
  kind.startsWith("enum:")
    ? `enum(${(JSON.parse(kind.slice(5)) as string[]).join(" | ")})`
    : kind.replace(":", " of ").replace("+", " or ");

// An absolute path written as a string starts with a slash (an interpolation is not judged).
const isAbsolute = (a: Assignment) =>
  a.kind === "str" && (a.value === undefined || a.value.startsWith("/"));

// A value against alternatives: `list:str+int` is a list of strings or integers, `list` any list.
function mixMismatch(kinds: string[], a: Assignment): string | undefined {
  const fits = (kind: string) => {
    if (kind.startsWith("enum:")) {
      const values = JSON.parse(kind.slice("enum:".length)) as string[];
      return a.kind === "str" && (a.value === undefined || values.includes(a.value));
    }
    if (kind === "path") return isAbsolute(a);
    if (a.kind !== "list" || !kind.startsWith("list")) return kind === a.kind;
    const elements = kind.slice("list:".length).split("+");
    return (
      kind === "list" ||
      !a.items ||
      a.items.every((item) => item === "other" || elements.includes(item))
    );
  };
  return kinds.some(fits) ? undefined : kinds.map(describeKind).join(" | ");
}

// A value written as a key of an `attrsOf` option against the kinds that option's values may be.
export function valueMismatch(owner: IndexedOption, a: Assignment): string | undefined {
  const direct = a.path.length === owner.segs.length + 1;
  if (owner.type !== "attrs" || !owner.values || !direct || a.kind === "other") return undefined;
  return mixMismatch(owner.values, a);
}

export function typeMismatch(entry: IndexedOption, a: Assignment): string | undefined {
  const { type } = entry;
  if (a.kind === "other" || type === "any" || type === "hidden") return undefined;
  if (type === "enum") {
    const ok = a.kind === "str" && (a.value === undefined || entry.values?.includes(a.value));
    return ok ? undefined : `enum(${entry.values?.join(" | ")})`;
  }
  if (type === "path") return isAbsolute(a) ? undefined : "absolute path";
  if (type === "mix") return mixMismatch(entry.values ?? [], a);
  if (type === "list" && a.kind === "list") return wrongElements(entry, a);
  const expected = type === "set" ? "attrs" : type;
  return expected === a.kind ? undefined : expected;
}
