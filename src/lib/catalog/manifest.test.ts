import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";

interface Manifest {
  lock: string;
  catalogs: Record<
    string,
    { source: string; revisions: Record<string, string>; files: Record<string, string> }
  >;
}

describe("catalog manifest (public/catalog/manifest.json)", () => {
  const dir = `${import.meta.dir}/../../../public/catalog`;
  const sha256 = (data: ArrayBuffer) => new Bun.CryptoHasher("sha256").update(data).digest("hex");

  test("lists every catalog, with the revision of each source and the hash of each file", async () => {
    const manifest = (await Bun.file(`${dir}/manifest.json`).json()) as Manifest;
    const directories = readdirSync(dir).filter((name) => name !== "manifest.json");
    expect(Object.keys(manifest.catalogs).sort()).toEqual(directories.sort());
    for (const [name, catalog] of Object.entries(manifest.catalogs)) {
      for (const revision of Object.values(catalog.revisions))
        expect(revision).toMatch(/^[0-9a-f]{40}$/);
      // Nothing more and nothing less than what is listed is in the directory.
      expect(readdirSync(`${dir}/${name}`).sort()).toEqual(Object.keys(catalog.files).sort());
    }
  });

  test("the files are the ones the manifest hashed", async () => {
    const manifest = (await Bun.file(`${dir}/manifest.json`).json()) as Manifest;
    const mismatched: string[] = [];
    for (const [name, catalog] of Object.entries(manifest.catalogs)) {
      for (const [file, hash] of Object.entries(catalog.files)) {
        const data = await Bun.file(`${dir}/${name}/${file}`).arrayBuffer();
        if (sha256(data) !== hash) mismatched.push(`${name}/${file}`);
      }
    }
    expect(mismatched).toEqual([]);
  });

  test("records the hash of the lock the catalogs were generated from", async () => {
    const manifest = (await Bun.file(`${dir}/manifest.json`).json()) as Manifest;
    const lock = await Bun.file(
      `${import.meta.dir}/../../../tools/catalog/flake.lock`,
    ).arrayBuffer();
    expect(manifest.lock).toBe(sha256(lock));
  });
});
