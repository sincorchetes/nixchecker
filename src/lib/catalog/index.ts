import type { Target } from "./types";

export { type Catalog, type IndexedOption, loadCatalog } from "./load";
export { buildTree, type OptionTree } from "./tree";
export type { OptionEntry, OptionType, Target } from "./types";

export const TARGETS: Target[] = ["nixos", "home-manager", "disko", "flake"];

/** Official documentation page for a target, deep-linked to an option when possible. */
export function docUrl(target: Target, path?: string): string {
  switch (target) {
    case "nixos":
      return `https://search.nixos.org/options?query=${encodeURIComponent(path ?? "")}`;
    case "home-manager":
      return `https://nix-community.github.io/home-manager/options.xhtml${
        path ? `#opt-${path.replaceAll("*", "_name_")}` : ""
      }`;
    case "disko":
      return "https://github.com/nix-community/disko/blob/master/docs/reference.md";
    case "flake":
      return "https://nix.dev/manual/nix/latest/command-ref/new-cli/nix3-flake.html#flake-format";
  }
}
