// The settings of nix.conf, read from `nix config show --json`, which is how Nix itself describes them: the
// value each has by default tells its type. A list setting also has an `extra-` form that appends to it.
import { type OptionEntry, opt } from "../../src/lib/catalog/types";

export interface Setting {
  aliases: string[];
  defaultValue: unknown;
}
export type Settings = Record<string, Setting>;

// Settings whose value is not only what the default says: `max-jobs` takes a number or `auto`, `sandbox`
// a boolean or `relaxed`. The overrides are checked against Nix by `devenv shell -- integration`.
const OVERRIDES: Record<string, OptionEntry> = {
  "max-jobs": opt("max-jobs", "mix", { values: ["int", 'enum:["auto"]'] }),
  sandbox: opt("sandbox", "mix", { values: ["bool", 'enum:["relaxed"]'] }),
};

// Lists that cannot be appended to with `extra-`: Nix does not say which in its description, the oracle found them.
const NOT_APPENDABLE = new Set(["allowed-impure-host-deps", "external-builders", "plugin-files"]);

// A setting that is text, or a list, takes any words: `a b c` is a list, and one word can be a number or `true`
// and still be the text. Only a boolean and a number are held to their kind.
const TEXT = ["str", "list", "bool", "int"];

const typed = (path: string, value: unknown, name: string): OptionEntry[] => {
  if (Array.isArray(value)) {
    const plain = opt(path, "mix", { values: TEXT });
    return NOT_APPENDABLE.has(name)
      ? [plain]
      : [plain, opt(`extra-${path}`, "mix", { values: TEXT })];
  }
  if (typeof value === "boolean") return [opt(path, "bool")];
  if (typeof value === "number") return [opt(path, "int")];
  if (typeof value === "object" && value !== null) {
    return [opt(path, "any"), opt(`extra-${path}`, "any")];
  }
  return [opt(path, "mix", { values: TEXT })];
};

/** An entry for each setting and each alias of one, sorted by path. */
export function nixConfEntries(settings: Settings): OptionEntry[] {
  const entries = Object.entries(settings).flatMap(([name, { aliases, defaultValue }]) =>
    [name, ...aliases].flatMap((path) =>
      OVERRIDES[name] ? [{ ...OVERRIDES[name], path }] : typed(path, defaultValue, name),
    ),
  );
  return entries.sort((a, b) => (a.path < b.path ? -1 : 1));
}
