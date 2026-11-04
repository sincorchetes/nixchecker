/** Systems a configuration can be built for. The options are the same on all of them; Nix evaluates differently. */
export const SYSTEMS = ["x86_64-linux", "aarch64-linux"] as const;
export type System = (typeof SYSTEMS)[number];
export const DEFAULT_SYSTEM: System = "x86_64-linux";
