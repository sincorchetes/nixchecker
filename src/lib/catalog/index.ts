import type { Target } from "./types";
import type { Version } from "./versions";

export { type Catalog, CatalogError, type IndexedOption, loadCatalog } from "./load";
export { DEFAULT_SYSTEM, isDarwin, SYSTEMS, type System } from "./systems";
export { buildTree, type OptionTree } from "./tree";
export type { OptionEntry, OptionType, Target } from "./types";
export { catalogName, DEFAULT_VERSION, VERSIONS, type Version } from "./versions";

export const TARGETS: Target[] = [
  "nixos",
  "home-manager",
  "nix-darwin",
  "nix-conf",
  "disko",
  "flake",
];

/** Official documentation page for a target, deep-linked to an option when possible. */
export function docUrl(target: Target, path?: string, version?: Version): string {
  switch (target) {
    case "nixos":
      return `https://search.nixos.org/options?${version ? `channel=${version}&` : ""}query=${encodeURIComponent(path ?? "")}`;
    case "home-manager":
      return `https://nix-community.github.io/home-manager/options.xhtml${
        path ? `#opt-${path.replaceAll("*", "_name_")}` : ""
      }`;
    case "nix-darwin":
      return `https://nix-darwin.github.io/nix-darwin/manual/index.html${path ? `#opt-${path.replaceAll("*", "_name_")}` : ""}`;
    case "nix-conf":
      return `https://nix.dev/manual/nix/latest/command-ref/conf-file.html${path ? `#conf-${path.replace(/^extra-/, "")}` : ""}`;
    case "disko":
      return "https://github.com/nix-community/disko/blob/master/docs/reference.md";
    case "flake":
      return "https://nix.dev/manual/nix/latest/command-ref/new-cli/nix3-flake.html#flake-format";
  }
}
