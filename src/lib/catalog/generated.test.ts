import { describe, expect, test } from "bun:test";
import { analyze, check } from "../validate";
import { decodeRow, loadCatalog } from "./load";
import { shardFile } from "./shard";
import { childrenOf } from "./tree";
import type { CatalogIndex, OptionRow } from "./types";
import { catalogName, DEFAULT_VERSION, VERSIONS } from "./versions";

describe("generated catalogs (public/catalog)", () => {
  const dir = `${import.meta.dir}/../../../public/catalog`;
  // Every shard of a target, read straight from disk.
  const read = async (target: string) => {
    const index = (await Bun.file(`${dir}/${target}/index.json`).json()) as CatalogIndex;
    const rows = await Promise.all(
      index.keys.map((key) => Bun.file(`${dir}/${target}/${shardFile(key)}`).json()),
    );
    return { entries: (rows.flat() as OptionRow[]).map(decodeRow) };
  };
  // A fetcher that serves the generated files, to run the real loader against them.
  const disk = (async (url: string) => {
    const file = Bun.file(`${dir}/${url.replace(/^\/catalog\//, "")}`);
    return (await file.exists())
      ? Response.json(await file.json())
      : new Response("no", { status: 404 });
  }) as unknown as typeof fetch;

  test("every target ships a catalog with its well-known options", async () => {
    const has = async (target: string, path: string, type: string) =>
      (await read(target)).entries.some((e) => e.path === path && e.type === type);
    expect(await has("nixos-unstable", "services.openssh.enable", "bool")).toBe(true);
    expect(await has("nixos-unstable", "users.users", "set")).toBe(true);
    expect(await has("home-manager-unstable", "programs.git.enable", "bool")).toBe(true);
    expect(await has("disko", "disko.devices.disk.*.device", "path")).toBe(true);
    expect(await has("flake", "inputs.*.url", "str")).toBe(true);
    // Every release ships both catalogs, and an option can exist in one release only.
    for (const version of VERSIONS) {
      expect(await has(`nixos-${version}`, "services.openssh.enable", "bool")).toBe(true);
      expect(await has(`home-manager-${version}`, "programs.git.enable", "bool")).toBe(true);
    }
    expect(catalogName("nixos", "26.05")).toBe("nixos-26.05");
    expect(catalogName("disko", "26.05")).toBe("disko");
    expect(DEFAULT_VERSION).toBe(VERSIONS[0]);
  });

  test("keys inside an open submodule are not errors (programs.ssh.settings)", async () => {
    const src = `{ programs.ssh.settings."*" = { KexAlgorithms = "x"; IdentityAgent = "y"; header = "h"; }; }`;
    const analysis = analyze(src);
    const paths = analysis.assignments.map((a) => a.path);
    const catalog = await loadCatalog("home-manager", "26.05", "/", paths, disk);
    expect(check(analysis, "home-manager", catalog.tree, "26.05").diagnostics).toEqual([]);
    // The one documented key is still checked.
    const wrong = analyze(`{ programs.ssh.settings."*".header = [ ]; }`);
    const loaded = await loadCatalog(
      "home-manager",
      "26.05",
      "/",
      wrong.assignments.map((a) => a.path),
      disk,
    );
    expect(check(wrong, "home-manager", loaded.tree, "26.05").diagnostics[0]?.code).toBe(
      "type-mismatch",
    );
  });

  test("a file that only names a root does not make it look unknown", async () => {
    const src = "{ programs = lib.mkMerge [ ]; services = lib.mkMerge [ ]; }";
    const analysis = analyze(src);
    const paths = analysis.assignments.map((a) => a.path);
    const catalog = await loadCatalog("home-manager", "26.05", "/", paths, disk);
    expect(check(analysis, "home-manager", catalog.tree, "26.05").diagnostics).toEqual([]);
    // And a typo of a root can still be suggested without loading anything of it.
    const typo = analyze("{ progrms = 1; }");
    const report = check(typo, "home-manager", catalog.tree, "26.05");
    expect(report.diagnostics[0]?.suggestion).toBe("programs");
  });

  test("renames come from the module sources, not only from the overlay", async () => {
    const nixos = await read("nixos-unstable");
    expect(nixos.entries.find((e) => e.path === "boot.cleanTmpDir")?.renamedTo).toBe(
      "boot.tmp.cleanOnBoot",
    );
    expect(nixos.entries.filter((e) => e.renamedTo).length).toBeGreaterThan(300);
  });

  test("only the shards a file touches are loaded, and typos still get suggestions", async () => {
    const src =
      '{ servics.openssh.enable = true; services.opnssh.ports = [ 22 ]; networking.hostName = "x"; }';
    const analysis = analyze(src);
    const paths = analysis.assignments.map((a) => a.path);
    const catalog = await loadCatalog("nixos", "unstable", "/", paths, disk);
    const report = check(analysis, "nixos", catalog.tree);
    expect(report.diagnostics.map((d) => d.suggestion)).toEqual([
      "services.openssh.enable",
      "services.openssh.ports",
    ]);
    expect(catalog.entries.length).toBeLessThan((await read("nixos-unstable")).entries.length / 20);
    // What is loaded cannot list the roots or the children of a split root; a branch below it can.
    expect(childrenOf(catalog.tree, [])).toEqual([]);
    expect(childrenOf(catalog.tree, ["services"])).toEqual([]);
    expect(childrenOf(catalog.tree, ["services", "openssh"])).toContain("enable");
  });
});
