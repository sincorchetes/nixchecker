// Checks Nix files or flakes in two layers: the static analysis of the page, and the real module system
// of the Nix on this machine, which settles what the analysis can only guess (imports, mkIf, merging,
// priorities, assertions). Directories are searched for .nix files.
//   bun tools/local/check.ts <file.nix|dir>... [--target nixos|home-manager|disko] [--release unstable|26.05|25.11]
//        [--nixpkgs DIR] [--home-manager DIR] [--disko DIR] [--static] [--partial] [--format text|json|sarif]
//   --json is --format json. sarif is for code scanning (GitHub annotations).
//   --partial: the file is part of a system, not all of it: read its options, skip the system assertions.
// Without --nixpkgs (and --home-manager) the pinned sources of --release are built (needs Nix).
import { parseArgs } from "node:util";
import { DEFAULT_VERSION, VERSIONS, type Version } from "../../src/lib/catalog/versions";
import { checkFile, type Result } from "./check-file";
import { nixFiles } from "./files";
import { printText } from "./report";
import { toSarif } from "./sarif";

const { values: opts, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    target: { type: "string" },
    release: { type: "string" },
    nixpkgs: { type: "string" },
    "home-manager": { type: "string" },
    disko: { type: "string" },
    static: { type: "boolean" },
    partial: { type: "boolean" },
    json: { type: "boolean" },
    format: { type: "string" },
  },
});
if (positionals.length === 0) {
  console.error("usage: check.ts <file.nix|dir>... [--target T] [--release V] [--static] [--json]");
  process.exit(2);
}
// `--json` is `--format json`.
const format = opts.format ?? (opts.json ? "json" : "text");
if (!["text", "json", "sarif"].includes(format)) {
  console.error("--format is one of text, json, sarif");
  process.exit(2);
}
const version = (opts.release ?? DEFAULT_VERSION) as Version;
if (!VERSIONS.includes(version)) throw new Error(`unknown release ${version}`);

const paths = await nixFiles(positionals);
if (paths.length === 0) {
  console.error("no .nix files found");
  process.exit(2);
}
const results: Result[] = [];
for (const path of paths) {
  results.push(
    await checkFile(path, {
      target: opts.target,
      version,
      nixpkgs: opts.nixpkgs,
      homeManager: opts["home-manager"],
      disko: opts.disko,
      static: opts.static,
      partial: opts.partial,
    }),
  );
}

// One file keeps the object a run always printed; several are a list of those objects.
if (format === "sarif") console.log(JSON.stringify(toSarif(results), null, 2));
else if (format === "json")
  console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
else {
  for (const r of results) {
    if (results.length > 1) console.log(`\n== ${r.file}`);
    const { checked, total } = r.coverage;
    printText(
      r.items,
      `${checked} of ${total} assignments checked statically.`,
      r.evaluated || !!opts.static,
    );
  }
}
process.exit(results.some((r) => r.items.some((i) => i.severity === "error")) ? 1 : 0);
