import { catalogName, type Target } from "./catalog";

/**
 * The command line that makes the same check with the real module system of the local Nix, for what the page
 * cannot judge. The release only counts for the targets that have one catalog per release, and the system
 * for those Nix builds (flakes and nix.conf are not built for one).
 */
export function cliCommand(target: Target, release: string, system: string): string {
  const parts = [
    "nix run github:sincorchetes/nixchecker --",
    "my-config.nix",
    `--target ${target}`,
  ];
  if (catalogName(target, "unstable") !== target) parts.push(`--release ${release}`);
  if (target !== "flake" && target !== "nix-conf") parts.push(`--system ${system}`);
  return parts.join(" ");
}
