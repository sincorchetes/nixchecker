// What the manuals say of an option, for the editor's hover: its description, default and example. The
// catalogs keep none of it (it would be most of their size), but the bundle they are made from has it all
// in `options.json`. That is read the first time it is needed, which can take a while if Nix has to build
// it: the hover does not wait for it, and says more once it is there.
import { join } from "node:path";
import type { Target } from "../../src/lib/catalog";
import type { Version } from "../../src/lib/catalog/versions";
import { bundleOut } from "../corpus/sources";

export interface Doc {
  description?: string;
  default?: unknown;
  example?: unknown;
}

// The names the manuals give to the options inside a submodule (`<name>`) are `*` in the catalogs.
const normalize = (name: string) => name.replace(/<[^<>]+>/g, "*").replace(/"([^".]*)"/g, "$1");

/** The bundle that documents a target, if there is one (flakes have no options file). */
export function bundleFor(target: Target, version: Version): string | undefined {
  const release = version === "unstable" ? version : version.replace(".", "");
  if (target === "nixos") return `nixos-${release}`;
  if (target === "home-manager") return `home-manager-${release}`;
  return target === "disko" ? "disko" : undefined;
}

const loaded = new Map<string, Map<string, Doc> | null>();
const loading = new Set<string>();

/** The docs of a target, or undefined while they are not read yet (this starts reading them). */
export function docsOf(target: Target, version: Version): Map<string, Doc> | undefined {
  const attr = bundleFor(target, version);
  if (!attr) return undefined;
  const known = loaded.get(attr);
  if (known !== undefined) return known ?? undefined;
  if (!loading.has(attr)) {
    loading.add(attr);
    bundleOut(attr)
      .then((out) => Bun.file(join(out, "options.json")).json())
      .then((raw: Record<string, Doc>) => {
        loaded.set(attr, new Map(Object.entries(raw).map(([name, doc]) => [normalize(name), doc])));
      })
      // A bundle that cannot be built is not tried again, and the hover does without.
      .catch(() => loaded.set(attr, null));
  }
  return undefined;
}

// A value as the manuals write it: an expression as its text, anything else as JSON.
function show(value: unknown): string {
  const text =
    typeof value === "object" && value !== null && "text" in value
      ? String((value as { text: unknown }).text)
      : JSON.stringify(value);
  return text.length > 240 ? `${text.slice(0, 240)}…` : text;
}

const LIMIT = 900;

/** The lines a hover adds for an option: what it is for, what it defaults to, and an example. */
export function describeDoc(doc: Doc): string[] {
  const lines: string[] = [];
  // The manuals mark references with roles, {option}`x`: the editor shows the code alone.
  const text = doc.description?.replace(/\{[a-z]+\}(?=`)/g, "").trim();
  if (text) lines.push(text.length > LIMIT ? `${text.slice(0, LIMIT)}…` : text);
  if (doc.default !== undefined) lines.push(`Default: \`${show(doc.default)}\``);
  if (doc.example !== undefined) lines.push(`Example: \`${show(doc.example)}\``);
  return lines;
}
