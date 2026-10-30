import type { Target } from "./types";

/** NixOS and Home Manager releases that have a catalog; `unstable` follows the development branches. */
export const VERSIONS = ["26.05", "25.11", "unstable"] as const;
export type Version = (typeof VERSIONS)[number];
/** The newest release: what most people run. */
export const DEFAULT_VERSION: Version = "26.05";

/** Name of a catalog directory. Only NixOS and Home Manager are versioned; disko and flakes are not. */
export const catalogName = (target: Target, version: Version): string =>
  target === "nixos" || target === "home-manager" ? `${target}-${version}` : target;
