/** Systems a configuration can be built for. The options are the same on all of a family; Nix evaluates differently. */
export const SYSTEMS = [
  "x86_64-linux",
  "aarch64-linux",
  "aarch64-darwin",
  "x86_64-darwin",
] as const;
export type System = (typeof SYSTEMS)[number];
export const DEFAULT_SYSTEM: System = "x86_64-linux";

export const isDarwin = (system: string): boolean => system.endsWith("-darwin");
