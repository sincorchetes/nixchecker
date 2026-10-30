// Parses every .nix file of the pinned nixpkgs and Home Manager sources and fails on any syntax
// problem or impossible call. All of those files are valid Nix, so either is a false positive.
//   bun tools/corpus/run.ts            (needs Nix; `devenv shell -- corpus`)
import { join } from "node:path";
import { findMistakes } from "../../src/lib/nix/mistakes";
import { parse } from "../../src/lib/nix/parse";
import { sourceRoots } from "./sources";

// Real mistakes in nixpkgs that the check is right about: valid syntax, but evaluating them fails
// (`[ 1 ] + [ 2 ]` is an error in Nix). They stay unnoticed because the attribute is never forced.
const KNOWN_UPSTREAM = new Set([
  "nixos/modules/system/boot/networkd.nix:560:61 list-plus [ … ]", // boolValues + [ "inherit" ]
]);

const roots = await sourceRoots();
let files = 0;
const failures: string[] = [];
for (const root of roots) {
  for await (const file of new Bun.Glob("**/*.nix").scan({ cwd: root, followSymlinks: true })) {
    files++;
    const { ast, problems } = parse(await Bun.file(join(root, file)).text());
    const first = problems[0];
    if (first) failures.push(`${file}:${first.line}:${first.col} ${first.code}`);
    // Valid code never has a mistake of that kind.
    const call = ast && findMistakes(ast)[0];
    const known = call && `${file}:${call.line}:${call.col} ${call.code} ${call.name}`;
    if (known && !KNOWN_UPSTREAM.has(known)) failures.push(known);
  }
}
console.log(`${files} files parsed, ${failures.length} with problems`);
for (const failure of failures.slice(0, 20)) console.log(`  ${failure}`);
if (failures.length > 0) process.exit(1);
