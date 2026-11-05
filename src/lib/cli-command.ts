import { catalogName, type Target } from "./catalog";

// A name with blanks or shell characters is quoted, as it would have to be typed.
const quote = (name: string): string =>
  /^[\w./@+-]+$/.test(name) ? name : `'${name.replaceAll("'", "'\\''")}'`;

/**
 * The command line that makes the same check with the real module system of the local Nix, for what the page
 * cannot judge, over the files of the project. The release only counts for the targets that have one catalog
 * per release, and the system for those Nix builds (flakes and nix.conf are not built for one).
 */
export function cliCommand(
  target: Target,
  release: string,
  system: string,
  files: string[] = ["my-config.nix"],
): string {
  const parts = [
    "nix run github:sincorchetes/nixchecker --",
    ...files.map(quote),
    `--target ${target}`,
  ];
  if (catalogName(target, "unstable") !== target) parts.push(`--release ${release}`);
  if (target !== "flake" && target !== "nix-conf") parts.push(`--system ${system}`);
  return parts.join(" ");
}
