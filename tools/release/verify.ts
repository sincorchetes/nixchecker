// Checks that the tag being released is the version in package.json, the one source of the version
// (`nixchecker --version` and the Nix package read it). Run by the Release workflow:
//   bun tools/release/verify.ts v0.0.2
import { join } from "node:path";

/** Why the tag is not the version of the package, or undefined when it is. */
export function mismatch(tag: string, version: string): string | undefined {
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) return `the tag "${tag}" is not of the form v0.0.<n>`;
  return tag === `v${version}`
    ? undefined
    : `the tag is ${tag} but package.json says ${version}: set "version" to ${tag.slice(1)} in a pull request first`;
}

if (import.meta.main) {
  const tag = process.argv[2];
  if (!tag) {
    console.error("usage: verify <tag>");
    process.exit(2);
  }
  const { version } = await Bun.file(join(import.meta.dir, "..", "..", "package.json")).json();
  const problem = mismatch(tag, version);
  if (problem) {
    console.error(`release: ${problem}`);
    process.exit(1);
  }
  console.log(`release: ${tag} is the version of package.json`);
}
