import { enumElementKind, patternKind } from "./pattern";
import type { OptionType } from "./types";

/**
 * The type of an option as `tools/catalog/shapes.nix` reads it from Nix: a list of alternatives, one
 * of which a value must be. `"b"` `"i"` `"s"` `"a"` are a bool, an integer, a string and an attribute
 * set; `["l", ...]` is a list whose elements are one of the alternatives that follow; `["e", ...]`
 * is one of those strings; `["r", regex]` is a string matching all of the regular expression; `["m", ...]` is an attribute set whose values are one of the alternatives that
 * follow; `"?"` is something that cannot be told apart.
 */
export type Alt = string | Alt[];
export type Shape = Alt[];

// A float is something a catalog never sees written (it reads one as a value it cannot judge), so an
// alternative that is a float adds nothing to the kinds a value may be.
const withoutFloats = (alts: Alt[]): Alt[] => alts.filter((alt) => alt !== "f");

export interface Shaped {
  type: OptionType;
  values?: string[];
}

const KIND: Record<string, string> = {
  b: "bool",
  i: "int",
  s: "str",
  a: "attrs",
  p: "path",
  k: "pkg",
  u: "fn",
};

const ELEMENT: Record<string, string> = { m: "attrs", l: "list" };

// An alternative that is a list or a set: the kind of what it holds, and a pattern keeps its expression.
const elementKind = (alt: Alt[]): string | undefined => {
  if (alt[0] === "r") return patternKind(alt[1] as string);
  if (alt[0] === "e") return enumElementKind(alt.slice(1) as string[]);
  return ELEMENT[alt[0] as string];
};

// What an alternative of a list's elements allows, as the kinds a catalog stores. Undefined when it is
// something nothing can be said about.
function elementKinds(all: Alt[]): string[] | undefined {
  const alts = withoutFloats(all);
  if (alts.length === 0) return undefined;
  const kinds = alts.map((alt) => (Array.isArray(alt) ? elementKind(alt) : KIND[alt]));
  return kinds.every(Boolean) ? [...new Set(kinds as string[])] : undefined;
}

// One alternative as a kind, with the kind of its elements when it is a list: `list:str+int`.
function token(alt: Alt): string | undefined {
  if (!Array.isArray(alt)) return KIND[alt];
  if (alt[0] === "m") return "attrs";
  if (alt[0] === "r") return patternKind(alt[1] as string);
  // A fixed set of strings keeps its values: `enum:["auto"]`.
  if (alt[0] === "e") return `enum:${JSON.stringify(alt.slice(1))}`;
  const elements = elementKinds(alt.slice(1));
  return elements && !elements.includes("list") ? `list:${elements.join("+")}` : "list";
}

/**
 * Turns a shape into the type nixchecker stores. Undefined when the shape tells nothing the manuals
 * do not tell better: just "an attribute set" (whether it is free-form or has options below it is not
 * a matter of its type), or just something unreadable (a type with a name of its own, such as an
 * absolute path, is only described in the manuals).
 */
export function fromShape(all: Shape): Shaped | undefined {
  const shape = withoutFloats(all);
  if (shape.length === 0) return undefined;
  const [only] = shape;
  if (shape.length === 1 && (only === "a" || only === "?")) return undefined;
  // One alternative we cannot read may take any kind of value, so nothing is checked.
  if (shape.some((alt) => alt === "?")) return { type: "any" };
  if (shape.length === 1 && Array.isArray(only)) {
    const [head, ...rest] = only;
    // Strict or free-form is not a matter of type; its values are read apart (`elementsOf`).
    if (head === "m") return undefined;
    if (head === "e") return { type: "enum", values: rest as string[] };
    if (head === "r") return { type: "mix", values: [patternKind(rest[0] as string)] };
    const elements = elementKinds(rest);
    return { type: "list", ...(elements && { values: elements }) };
  }
  const kinds = [...new Set(shape.map(token))];
  if (kinds.includes(undefined)) return { type: "any" };
  const [one] = kinds as string[];
  // A package or a function is a kind a value can be, not a type of its own: held as an alternative of one.
  if ((one === "pkg" || one === "fn") && kinds.length === 1) return { type: "mix", values: [one] };
  if (kinds.length === 1 && one && !/^(list|enum|re:)/.test(one))
    return { type: one as OptionType };
  return { type: "mix", values: kinds as string[] };
}

/**
 * For an option that is just an attribute set of something (`attrsOf`): the kinds its values may be,
 * when they can be told. A value written under it can then be checked, though the option has no
 * entry for it.
 */
export function elementsOf(shape: Shape): string[] | undefined {
  const [only] = shape;
  if (shape.length !== 1 || !Array.isArray(only) || only[0] !== "m") return undefined;
  const values = withoutFloats(only.slice(1));
  const kinds = values.map(token);
  return values.length > 0 && kinds.every(Boolean) ? [...new Set(kinds as string[])] : undefined;
}
