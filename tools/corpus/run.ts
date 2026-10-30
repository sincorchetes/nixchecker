// Parses every .nix file of the pinned nixpkgs and Home Manager sources and fails on any syntax
// problem or impossible call. All of those files are valid Nix, so either is a false positive.
//   bun tools/corpus/run.ts            (needs Nix; `devenv shell -- corpus`)
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { findMistakes } from "../../src/lib/nix/mistakes";
import { parse } from "../../src/lib/nix/parse";

// Real mistakes in nixpkgs that the check is right about: valid syntax, but evaluating them fails
// (`[ 1 ] + [ 2 ]` is an error in Nix). They stay unnoticed because the attribute is never forced.
const KNOWN_UPSTREAM = new Set([
  "nixos/modules/system/boot/networkd.nix:560:61 list-plus [ … ]", // boolValues + [ "inherit" ]
]);

const flakeDir = join(import.meta.dir, "..", "catalog");

// The whole repository a catalog bundle was read from: its `src` link points at the modules
// directory, which is `levels` directories below the root.
async function sourceRoot(attr: string, levels: number): Promise<string> {
  const proc = Bun.spawn(
    [
      "nix",
      "build",
      `${flakeDir}#${attr}`,
      "--no-link",
      "--print-out-paths",
      "--extra-experimental-features",
      "nix-command flakes",
    ],
    { stderr: "inherit" },
  );
  const out = (await new Response(proc.stdout).text()).trim();
  if ((await proc.exited) !== 0) throw new Error(`nix build ${attr} failed`);
  return join(await realpath(join(out, "src")), ...Array(levels).fill(".."));
}

const roots = await Promise.all([
  sourceRoot("nixos-unstable", 2), // nixpkgs/nixos/modules
  sourceRoot("home-manager-unstable", 1), // home-manager/modules
]);
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
