import type { Target } from "./types";

/**
 * A project whose modules add options to NixOS. Its catalog holds only the options it adds (`ext-<name>`),
 * and is loaded on top of the one of NixOS when a file writes below one of its `prefix`es.
 */
export interface Extension {
  name: string;
  /** Where its options start: `sops` is every option of sops-nix, `environment.persistence` those of impermanence. */
  prefix: string[];
  /** Where its options are documented. */
  docs: string;
}

export const EXTENSIONS: Extension[] = [
  { name: "sops-nix", prefix: ["sops"], docs: "https://github.com/Mic92/sops-nix#usage-example" },
  { name: "agenix", prefix: ["age"], docs: "https://github.com/ryantm/agenix#tutorial" },
  {
    name: "impermanence",
    prefix: ["environment", "persistence"],
    docs: "https://github.com/nix-community/impermanence#readme",
  },
];

const under = (ext: Extension, path: string[]): boolean =>
  ext.prefix.every((seg, n) => path[n] === seg);

/** The extensions a file's attribute paths ask for; only NixOS has any. */
export const extensionsFor = (target: Target, paths: string[][]): Extension[] =>
  target === "nixos" ? EXTENSIONS.filter((ext) => paths.some((p) => under(ext, p))) : [];

/** The extension that declares an option, from its dotted path. */
export const extensionOf = (path: string): Extension | undefined =>
  EXTENSIONS.find((ext) => under(ext, path.split(".")));

export const extensionCatalog = (ext: Extension): string => `ext-${ext.name}`;
