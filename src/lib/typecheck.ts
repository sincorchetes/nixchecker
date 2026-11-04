import type { SkipCause } from "./analysis";
import type { IndexedOption, OptionTree } from "./catalog";
import { splitPath } from "./catalog/path";
import { enumValues, isPatternKind, matches, patternOf } from "./catalog/pattern";
import { findExact, findOwner, knownPrefix } from "./catalog/tree";
import type { Assignment, ValueKind } from "./nix/scan";

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

// What can be a package: a set (a derivation is one), or a string that is the path of one in the store. A
// string with `${...}` in it is not judged, nor is a name or a call (whatever it is, it is not written out).
function packageFits(
  kind: ValueKind,
  value: string | undefined,
  plain: boolean | undefined,
): boolean {
  if (kind === "str") return value === undefined || value.startsWith("/nix/store/");
  // A set written out is one only if it says `type = "derivation"`; one that cannot is not.
  if (kind === "attrs") return !plain;
  return kind === "other";
}

// Whether a string (not written out in full, if `undefined`) is one an `enum:` kind allows.
const inEnum = (kind: string, value: string | undefined): boolean =>
  value === undefined || enumValues(kind).includes(value);

// Whether an element of a list written out can be one of the kinds the list takes.
function elementFits(
  allowed: string[],
  kind: ValueKind,
  value: string | undefined,
  plain: boolean | undefined,
): boolean {
  if (kind === "other" || allowed.includes(kind)) return true;
  if (kind === "str" && allowed.some((k) => isPatternKind(k) && matches(k, value))) return true;
  if (kind === "str" && allowed.some((k) => k.startsWith("enum:") && inEnum(k, value))) return true;
  if (kind === "str" && allowed.includes("path") && (value === undefined || value.startsWith("/")))
    return true;
  return allowed.includes("pkg") && packageFits(kind, value, plain);
}

// The kinds of the elements of a list written out that its option does not take.
function wrongKinds(entry: IndexedOption, a: Assignment): string[] {
  const allowed = entry.values ?? [];
  const wrong = (a.items ?? []).filter(
    (kind, n) => !elementFits(allowed, kind, a.itemValues?.[n], a.itemPlain?.[n]),
  );
  return [...new Set(wrong)];
}

// A list written out in full whose elements are of a kind its option does not take.
function wrongElements(entry: IndexedOption, a: Assignment): string | undefined {
  const allowed = entry.values;
  return allowed && wrongKinds(entry, a).length > 0
    ? `list of ${allowed.map(describeKind).join(" | ")}`
    : undefined;
}

/** What was written, for a message: its kind, and for a list the kinds of the elements that do not fit. */
export function describeGot(entry: IndexedOption, a: Assignment): string {
  const wrong = entry.type === "list" && a.kind === "list" ? wrongKinds(entry, a) : [];
  return wrong.length > 0 ? `list with ${wrong.map(describeKind).join(" and ")} elements` : a.kind;
}

const describeKind = (kind: string): string => {
  if (isPatternKind(kind)) {
    const pattern = patternOf(kind);
    return pattern.length > 30 ? "string matching its pattern" : `string matching ${pattern}`;
  }
  if (kind.startsWith("enum:")) return `enum(${enumValues(kind).join(" | ")})`;
  if (kind.startsWith("list:"))
    return `list of ${kind.slice(5).split("+").map(describeKind).join(" or ")}`;
  return ({ pkg: "package", fn: "function" } as Record<string, string>)[kind] ?? kind;
};

// An absolute path written as a string starts with a slash (an interpolation is not judged).
const isAbsolute = (a: Assignment) =>
  a.kind === "str" && (a.value === undefined || a.value.startsWith("/"));

// A value against alternatives: `list:str+int` is a list of strings or integers, `list` any list.
function mixMismatch(kinds: string[], a: Assignment): string | undefined {
  const fits = (kind: string) => {
    if (kind.startsWith("enum:")) {
      return a.kind === "str" && inEnum(kind, a.value);
    }
    if (isPatternKind(kind)) return a.kind === "str" && matches(kind, a.value);
    if (kind === "path") return isAbsolute(a);
    if (kind === "pkg") return packageFits(a.kind, a.value, a.plain);
    if (a.kind !== "list" || !kind.startsWith("list")) return kind === a.kind;
    const elements = kind.slice("list:".length).split("+");
    return (
      kind === "list" ||
      !a.items ||
      a.items.every((item, n) => elementFits(elements, item, a.itemValues?.[n], a.itemPlain?.[n]))
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

/**
 * A renamed option passes its value on as it is, so the value is held to the type of the option it was
 * renamed to (through the renames of renames): its own entry, or the `attrsOf` it is a key of. A new name
 * that is not known here, or is free-form, leaves the value unjudged.
 */
export function renamedMismatch(
  tree: OptionTree,
  entry: IndexedOption,
  a: Assignment,
): string | undefined {
  let at = entry;
  for (let hops = 0; at.renamedTo && hops < 4; hops++) {
    const path = splitPath(at.renamedTo);
    const next = findExact(tree, path);
    if (!next) {
      const owner = findOwner(tree, path);
      // Not known as an option of its own: a key of an `attrsOf`, or else the type the rename carries.
      return (owner && valueMismatch(owner, { ...a, path })) ?? typeMismatch(at, a);
    }
    at = next;
  }
  return typeMismatch(at, a);
}
