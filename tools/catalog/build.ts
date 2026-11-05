// Regenerates public/catalog/ from the pinned upstream projects (needs Nix).
//   bun tools/catalog/build.ts
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { convert, type Overlay } from "../../src/lib/catalog/convert";
import { EXTENSIONS, extensionCatalog } from "../../src/lib/catalog/extensions";
import { extractRenames } from "../../src/lib/catalog/renames";
import { shardFile, toShards } from "../../src/lib/catalog/shard";
import { catalogName, VERSIONS, type Version } from "../../src/lib/catalog/versions";
import { diskoEntries, LAYOUT_ROOTS } from "./disko";
import { nixConfEntries } from "./nix-conf";
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
  nodes: Record<
    string,
    { locked?: { rev: string; lastModified: number }; inputs?: Record<string, string | string[]> }
  >;
}

const lock = (await Bun.file(join(flakeDir, "flake.lock")).json()) as Lock;
// The lock names its nodes as it likes (`nixpkgs_2` when another input brings its own): an input of this flake is
// found by what the root points at.
const locked = (input: string) => {
  const target = lock.nodes.root?.inputs?.[input];
  return lock.nodes[typeof target === "string" ? target : input]?.locked;
};
const label = (name: string, node: string) => {
  const { rev, lastModified } = locked(node) ?? { rev: "unknown", lastModified: 0 };
  const date = new Date(lastModified * 1000).toISOString().slice(0, 10);
  return `${name} · ${rev.slice(0, 7)} · ${date}`;
};

// What a flake attribute is built from: the release as the flake spells it, and the lock nodes.
const suffix = (version: Version) => version.replace(".", "");
const nodes = (version: Version) =>
  version === "unstable"
    ? { nixpkgs: "nixpkgs", homeManager: "home-manager", nixDarwin: "nix-darwin" }
    : {
        nixpkgs: `nixpkgs-${suffix(version)}`,
        homeManager: `home-manager-${suffix(version)}`,
        nixDarwin: `nix-darwin-${suffix(version)}`,
      };

// Every `mkRenamedOptionModule` found in the module sources the bundle links to.
async function renamesIn(dir: string): Promise<Record<string, string>> {
  const found: Record<string, string> = {};
  // The scan comes in the order of the file system, which differs between machines: sorted, so that two
  // files that rename the same option settle the same way everywhere.
  const files: string[] = [];
  for await (const file of new Bun.Glob("**/*.nix").scan({ cwd: dir, followSymlinks: true })) {
    files.push(file);
  }
  for (const file of files.sort()) {
    Object.assign(found, extractRenames(await Bun.file(join(dir, file)).text()));
  }
  return found;
}

// The store path of what the flake makes for `attr`.
async function outPath(attr: string): Promise<string> {
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
  return out;
}

async function build(attr: string, overlay: Overlay) {
  const out = await outPath(attr);
  const options = await Bun.file(join(out, "options.json")).json();
  const hidden = await Bun.file(join(out, "hidden.json")).json();
  const shapes = await Bun.file(join(out, "shapes.json")).json();
  // What was written by hand wins over what was read from the sources.
  const renamed = { ...(await renamesIn(join(out, "src"))), ...overlay.renamed };
  return convert(options, hidden, { ...overlay, renamed }, shapes);
}

// The overlay of disko plus the nested options of its disk layouts, which its manual does not list.
async function withDiskoLayouts(overlay: Overlay): Promise<Overlay> {
  const layouts = diskoEntries(await Bun.file(await outPath("disko-types")).json());
  return {
    ...overlay,
    entries: [...(overlay.entries ?? []), ...layouts],
    authoritative: LAYOUT_ROOTS,
  };
}

// What each catalog was made from and the hash of every file in it, so a copy can be checked.
const manifest: Record<
  string,
  { source: string; revisions: Record<string, string>; files: Record<string, string> }
> = {};
const sha256 = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex");

async function write(
  name: string,
  source: string,
  entries: ReturnType<typeof convert>,
  nodes: string[] = [],
) {
  const { index, shards } = toShards(source, entries);
  const dir = join(outDir, name);
  await mkdir(dir, { recursive: true });
  const files: Record<string, string> = {};
  const put = async (file: string, data: unknown) => {
    const text = `${JSON.stringify(data)}\n`;
    await Bun.write(join(dir, file), text);
    files[file] = sha256(text);
  };
  await put("index.json", index);
  for (const [key, rows] of Object.entries(shards)) await put(shardFile(key), rows);
  const revisions = Object.fromEntries(nodes.map((n) => [n, locked(n)?.rev ?? "unknown"]));
  manifest[name] = { source, revisions, files: Object.fromEntries(Object.entries(files).sort()) };
  console.log(`${name}: ${entries.length} options in ${index.keys.length} shards (${source})`);
}

// Start clean: shards of options that no longer exist must not linger.
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
for (const version of VERSIONS) {
  const { nixpkgs, homeManager, nixDarwin } = nodes(version);
  const release = version === "unstable" ? version : suffix(version);
  const nixosLabel = version === "unstable" ? "nixpkgs-unstable" : `nixpkgs ${version}`;
  const hmLabel = version === "unstable" ? "home-manager" : `home-manager ${version}`;
  const darwinLabel = version === "unstable" ? "nix-darwin" : `nix-darwin ${version}`;
  await write(
    catalogName("nixos", version),
    label(nixosLabel, nixpkgs),
    await build(`nixos-${release}`, overlays.nixos),
    [nixpkgs],
  );
  await write(
    catalogName("home-manager", version),
    label(hmLabel, homeManager),
    await build(`home-manager-${release}`, overlays["home-manager"]),
    [homeManager, nixpkgs],
  );
  await write(
    catalogName("nix-darwin", version),
    label(darwinLabel, nixDarwin),
    await build(`nix-darwin-${release}`, overlays["nix-darwin"]),
    [nixDarwin, nixpkgs],
  );
}
await write(
  "disko",
  label("disko", "disko"),
  await build("disko", await withDiskoLayouts(overlays.disko)),
  ["disko", "nixpkgs"],
);
// The options other projects add to NixOS, each apart: loaded on top of the NixOS catalog when a file uses them.
for (const ext of EXTENSIONS) {
  await write(
    extensionCatalog(ext),
    label(ext.name, ext.name),
    await build(extensionCatalog(ext), {}),
    [ext.name, "nixpkgs"],
  );
}

// The settings of nix.conf are the ones Nix itself lists; there is no module system behind them.
const confOut = await outPath("nix-conf");
const nixVersion = (await Bun.file(join(confOut, "version")).text())
  .trim()
  .replace(/^nix \(Nix\) /, "Nix ");
await write(
  "nix-conf",
  `Nix manual · nix.conf · ${nixVersion}`,
  convert({}, [], { entries: nixConfEntries(await Bun.file(join(confOut, "config.json")).json()) }),
  ["nixpkgs"],
);
await write("flake", "Nix manual · flake format", convert({}, [], overlays.flake));

// The revisions are the pins of tools/catalog/flake.lock, whose own hash is recorded too.
const lockText = await Bun.file(join(flakeDir, "flake.lock")).text();
await Bun.write(
  join(outDir, "manifest.json"),
  `${JSON.stringify({ lock: sha256(lockText), catalogs: manifest }, null, 1)}\n`,
);
