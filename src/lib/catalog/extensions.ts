import type { Target } from "./types";

/**
 * A project whose modules add options to NixOS. Its catalog holds only the options it adds (`ext-<name>`),
 * and is loaded on top of the one of NixOS when a file writes below one of its `prefix`es.
 */
export interface Extension {
  name: string;
  /** The target it adds options to. */
  target: Target;
  /** Where its options start: `sops` is every option of sops-nix, `environment.persistence` those of impermanence. */
  prefix: string[];
  /** Where its options are documented. */
  docs: string;
}

export const EXTENSIONS: Extension[] = [
  {
    name: "sops-nix",
    target: "nixos",
    prefix: ["sops"],
    docs: "https://github.com/Mic92/sops-nix#usage-example",
  },
  {
    name: "sops-nix",
    target: "home-manager",
    prefix: ["sops"],
    docs: "https://github.com/Mic92/sops-nix#home-manager",
  },
  {
    name: "agenix",
    target: "nixos",
    prefix: ["age"],
    docs: "https://github.com/ryantm/agenix#tutorial",
  },
  {
    name: "lanzaboote",
    target: "nixos",
    prefix: ["boot", "lanzaboote"],
    docs: "https://nix-community.github.io/lanzaboote/",
  },
  {
    name: "impermanence",
    target: "nixos",
    prefix: ["environment", "persistence"],
    docs: "https://github.com/nix-community/impermanence#readme",
  },
];

const under = (ext: Extension, path: string[]): boolean =>
  ext.prefix.every((seg, n) => path[n] === seg);

/** The extensions of a target that a file's attribute paths ask for. */
export const extensionsFor = (target: Target, paths: string[][]): Extension[] =>
  EXTENSIONS.filter((ext) => ext.target === target && paths.some((p) => under(ext, p)));

/** The extension of a target that declares an option, from its dotted path. */
export const extensionOf = (target: Target, path: string): Extension | undefined =>
  EXTENSIONS.find((ext) => ext.target === target && under(ext, path.split(".")));

/** Its directory in `public/catalog`: the Home Manager one is apart from the NixOS one of the same project. */
export const extensionCatalog = (ext: Extension): string =>
  `ext-${ext.name}${ext.target === "home-manager" ? "-home" : ""}`;
