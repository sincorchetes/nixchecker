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

/**
 * The systems that make sense for a target: a Mac for nix-darwin, Linux for NixOS and disko; Home Manager,
 * `nix.conf`, flakes and a text not yet told apart run on both.
 */
export function systemsFor(target: string): readonly System[] {
  if (target === "nix-darwin") return SYSTEMS.filter(isDarwin);
  if (target === "nixos" || target === "disko") return SYSTEMS.filter((s) => !isDarwin(s));
  return SYSTEMS;
}
