// Regenerates public/catalog/ from the pinned upstream projects (needs Nix).
//   bun tools/catalog/build.ts
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { convert, type Overlay } from "../../src/lib/catalog/convert";
import { extractRenames } from "../../src/lib/catalog/renames";
import { shardFile, toShards } from "../../src/lib/catalog/shard";
import { catalogName, VERSIONS, type Version } from "../../src/lib/catalog/versions";
import { overlays } from "./overlay";

const root = join(import.meta.dir, "..", "..");
const flakeDir = import.meta.dir;

// `--update` moves the pinned upstream projects to their latest versions first (what the canary does).
if (process.argv.includes("--update")) {
  const update = Bun.spawn(
    [
      "nix",
      "flake",
      "update",
      "--flake",
      import.meta.dir,
      "--extra-experimental-features",
      "nix-command flakes",
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  if ((await update.exited) !== 0) throw new Error("nix flake update failed");
}
const outDir = join(root, "public", "catalog");

// Make sure every input is locked (new ones are added, pinned ones stay as they are) before reading the lock.
const lockProc = Bun.spawn(
  ["nix", "flake", "lock", flakeDir, "--extra-experimental-features", "nix-command flakes"],
  { stdout: "inherit", stderr: "inherit" },
);
if ((await lockProc.exited) !== 0) throw new Error("nix flake lock failed");

interface Lock {
  nodes: Record<string, { locked?: { rev: string; lastModified: number } }>;
}

const lock = (await Bun.file(join(flakeDir, "flake.lock")).json()) as Lock;
const label = (name: string, node: string) => {
  const { rev, lastModified } = lock.nodes[node]?.locked ?? { rev: "unknown", lastModified: 0 };
  const date = new Date(lastModified * 1000).toISOString().slice(0, 10);
  return `${name} · ${rev.slice(0, 7)} · ${date}`;
};

// What a flake attribute is built from: the release as the flake spells it, and the lock nodes.
const suffix = (version: Version) => version.replace(".", "");
const nodes = (version: Version) =>
  version === "unstable"
    ? { nixpkgs: "nixpkgs", homeManager: "home-manager" }
    : { nixpkgs: `nixpkgs-${suffix(version)}`, homeManager: `home-manager-${suffix(version)}` };

// Every `mkRenamedOptionModule` found in the module sources the bundle links to.
async function renamesIn(dir: string): Promise<Record<string, string>> {
  const found: Record<string, string> = {};
  for await (const file of new Bun.Glob("**/*.nix").scan({ cwd: dir, followSymlinks: true })) {
    Object.assign(found, extractRenames(await Bun.file(join(dir, file)).text()));
  }
  return found;
}

async function build(attr: string, overlay: Overlay) {
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
  const options = await Bun.file(join(out, "options.json")).json();
  const hidden = await Bun.file(join(out, "hidden.json")).json();
  const coerced = await Bun.file(join(out, "coerced.json")).json();
  // What was written by hand wins over what was read from the sources.
  const renamed = { ...(await renamesIn(join(out, "src"))), ...overlay.renamed };
  return convert(options, hidden, { ...overlay, renamed }, coerced);
}

async function write(name: string, source: string, entries: ReturnType<typeof convert>) {
  const { index, shards } = toShards(source, entries);
  const dir = join(outDir, name);
  await mkdir(dir, { recursive: true });
  await Bun.write(join(dir, "index.json"), `${JSON.stringify(index)}\n`);
  for (const [key, rows] of Object.entries(shards)) {
    await Bun.write(join(dir, shardFile(key)), `${JSON.stringify(rows)}\n`);
  }
  console.log(`${name}: ${entries.length} options in ${index.keys.length} shards (${source})`);
}

// Start clean: shards of options that no longer exist must not linger.
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
for (const version of VERSIONS) {
  const { nixpkgs, homeManager } = nodes(version);
  const release = version === "unstable" ? version : suffix(version);
  const nixosLabel = version === "unstable" ? "nixpkgs-unstable" : `nixpkgs ${version}`;
  const hmLabel = version === "unstable" ? "home-manager" : `home-manager ${version}`;
  await write(
    catalogName("nixos", version),
    label(nixosLabel, nixpkgs),
    await build(`nixos-${release}`, overlays.nixos),
  );
  await write(
    catalogName("home-manager", version),
    label(hmLabel, homeManager),
    await build(`home-manager-${release}`, overlays["home-manager"]),
  );
}
await write("disko", label("disko", "disko"), await build("disko", overlays.disko));
await write("flake", "Nix manual · flake format", convert({}, [], overlays.flake));
