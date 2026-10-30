import type { OptionType } from "./types";

/**
 * The type of an option as `tools/catalog/shapes.nix` reads it from Nix: a list of alternatives, one
 * of which a value must be. `"b"` `"i"` `"s"` `"a"` are a bool, an integer, a string and an attribute
 * set; `["l", ...]` is a list whose elements are one of the alternatives that follow; `["e", ...]`
 * is one of those strings; `"?"` is something that cannot be told apart.
 */
export type Alt = string | Alt[];
export type Shape = Alt[];

export interface Shaped {
  type: OptionType;
  values?: string[];
}

const KIND: Record<string, string> = { b: "bool", i: "int", s: "str", a: "attrs" };

// What an alternative of a list's elements allows, as the kinds a catalog stores. Undefined when it is
// something nothing can be said about.
function elementKinds(alts: Alt[]): string[] | undefined {
  const kinds = alts.map((alt) =>
    Array.isArray(alt) ? (alt[0] === "e" ? "str" : "list") : KIND[alt],
  );
  return kinds.every(Boolean) ? [...new Set(kinds as string[])] : undefined;
}

// One alternative as a kind, with the kind of its elements when it is a list: `list:str+int`.
function token(alt: Alt): string | undefined {
  if (!Array.isArray(alt)) return KIND[alt];
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
export function fromShape(shape: Shape): Shaped | undefined {
  const [only] = shape;
  if (shape.length === 1 && (only === "a" || only === "?")) return undefined;
  // One alternative we cannot read may take any kind of value, so nothing is checked.
  if (shape.some((alt) => alt === "?")) return { type: "any" };
  if (shape.length === 1 && Array.isArray(only)) {
    const [head, ...rest] = only;
    if (head === "e") return { type: "enum", values: rest as string[] };
    const elements = elementKinds(rest);
    return { type: "list", ...(elements && { values: elements }) };
  }
  const kinds = [...new Set(shape.map(token))];
  if (kinds.includes(undefined)) return { type: "any" };
  const [one] = kinds as string[];
  if (kinds.length === 1 && one && !/^(list|enum)/.test(one)) return { type: one as OptionType };
  return { type: "mix", values: kinds as string[] };
}
