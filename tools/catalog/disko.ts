// The nested options of disko, read from the types disko serializes for its own documentation
// (`diskoLib.jsonTypes`). Its manual only documents the top level, because a disk layout is made of
// polymorphic submodules chosen by `type`.
import { type Alt, elementsOf, fromShape, type Shape } from "../../src/lib/catalog/shape";
import type { OptionEntry } from "../../src/lib/catalog/types";

type Type =
  | string
  | { type?: string; subType?: Type; choices?: string[]; types?: Type[]; options?: Options };
type Options = Record<string, Type | { type: Type }>;
export type JsonTypes = Record<string, Options & { types?: string[] }>;

// A polymorphic place holds any of these types; below this many of them nested, it is left free-form.
const MAX_NESTING = 4;

// Where each kind of device is declared, and the type that describes its options.
const ROOTS: Record<string, string> = {
  disk: "disk",
  mdadm: "mdadm",
  zpool: "zpool",
  lvm_vg: "lvm_vg",
  nodev: "nodev",
  bcachefs_filesystems: "bcachefs_filesystem",
};

const PRIMITIVE: Record<string, Alt> = {
  str: "s",
  bool: "b",
  int: "i",
  "absolute-pathname": "p",
};

const POLYMORPHIC = { "<deviceType>": "deviceType", "<partitionType>": "partitionType" } as const;

const isOptions = (t: Type): t is { options: Options } =>
  typeof t === "object" && t.options !== undefined;

// An option is its type, or `{ type = ...; }` with a default and a description.
const typeOf = (option: Type | { type: Type }): Type =>
  typeof option === "string" ? option : (option.type as Type);

export function diskoEntries(types: JsonTypes): OptionEntry[] {
  const found = new Map<string, OptionEntry>();
  const names = new Set(Object.keys(types));
  // Places with options below them. One type can hold a list there where another holds a set
  // (`partitions` of the legacy `table` and of `gpt`): what is both is left unchecked.
  const containers = new Set<string>();

  // The same place can be described by several types (`content.type`): what they share is kept, and
  // what they do not is left unchecked.
  function put(entry: OptionEntry): void {
    if (containers.has(entry.path) && entry.type !== "set")
      entry = { path: entry.path, type: "any" };
    const before = found.get(entry.path);
    if (!before) return void found.set(entry.path, entry);
    if (before.type !== entry.type)
      return void found.set(entry.path, { path: entry.path, type: "any" });
    const values =
      before.values && entry.values ? [...new Set([...before.values, ...entry.values])] : undefined;
    found.set(entry.path, { ...before, ...(values && { values }) });
  }

  // What a value of this type may be, as the alternatives `fromShape` reads.
  function shapeOf(t: Type): Shape {
    if (typeof t === "string") return [PRIMITIVE[t] ?? "?"];
    if (isOptions(t)) return ["a"];
    const sub = t.subType as Type;
    switch (t.type) {
      case "listOf":
        return [["l", ...shapeOf(sub)]];
      case "attrsOf":
        return [["m", ...shapeOf(sub)]];
      case "nullOr":
        return shapeOf(sub);
      case "enum":
        return [["e", ...(t.choices as string[])]];
      case "oneOf":
        return (t.types as Type[]).flatMap((one) =>
          typeof one === "string" && names.has(one) ? ["a"] : shapeOf(one),
        );
      default:
        return ["?"];
    }
  }

  // The options below a value: those of a submodule, or of whichever types it may be.
  function below(t: Type): { options: Options[]; wild: boolean } | undefined {
    if (typeof t === "string") return undefined;
    if (isOptions(t)) return { options: [t.options], wild: false };
    if (t.type === "nullOr") return below(t.subType as Type);
    if (t.type !== "attrsOf") return undefined;
    const sub = t.subType as Type;
    if (isOptions(sub)) return { options: [sub.options], wild: true };
    if (typeof sub === "object" && sub.type === "oneOf") {
      const named = (sub.types as Type[]).filter(
        (one): one is string => typeof one === "string" && names.has(one),
      );
      return { options: named.map((n) => types[n] as Options), wild: true };
    }
    return undefined;
  }

  function option(path: string, raw: Type | { type: Type }, nesting: number): void {
    const t = typeOf(raw);
    const polymorphic =
      typeof t === "string" ? POLYMORPHIC[t as keyof typeof POLYMORPHIC] : undefined;
    if (polymorphic) {
      // Deep enough, the rest of the layout is not read.
      if (nesting >= MAX_NESTING) {
        found.set(path, { path, type: "attrs" });
        return;
      }
      // The manual describes this place by the names of the types; it is a strict set of their options,
      // as many as the types it may hold, whose options sit right below it.
      put({ path, type: "set" });
      containers.add(path);
      for (const kind of (types[polymorphic] as { types: string[] }).types) {
        options(path, types[kind] as Options, nesting + 1);
      }
      return;
    }
    const inner = below(t);
    if (inner) {
      containers.add(path);
      if (found.has(path) && found.get(path)?.type !== "set")
        found.set(path, { path, type: "any" });
      for (const one of inner.options) options(inner.wild ? `${path}.*` : path, one, nesting);
      return;
    }
    const shape = shapeOf(t);
    const values = elementsOf(shape);
    const read = fromShape(shape);
    put({
      path,
      ...(read ?? { type: shape.some((s) => Array.isArray(s) && s[0] === "m") ? "attrs" : "any" }),
      ...(!read && values && { values }),
    });
  }

  function options(path: string, of: Options, nesting: number): void {
    for (const [name, raw] of Object.entries(of)) {
      if (!name.startsWith("_")) option(`${path}.${name}`, raw, nesting);
    }
  }

  for (const [device, kind] of Object.entries(ROOTS)) {
    options(`disko.devices.${device}.*`, types[kind] as Options, 1);
  }
  return [...found.values()];
}
