import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MissingPath, nixFiles } from "./files";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "nixchecker-files-"));
  for (const sub of ["a", "node_modules", ".hidden", "result"]) await mkdir(join(dir, sub));
  for (const file of [
    "a/x.nix",
    "a/nix.conf",
    "a/notes.txt",
    "node_modules/y.nix",
    ".hidden/z.nix",
    "result/w.nix",
    "top.nix",
  ]) {
    await Bun.write(join(dir, file), "");
  }
});
afterAll(() => rm(dir, { recursive: true }));

describe("nixFiles", () => {
  test("a directory yields its .nix files and nix.conf, sorted, without dependencies, results or hidden ones", async () => {
    const found = (await nixFiles([dir])).map((p) => p.slice(dir.length + 1));
    expect(found).toEqual(["a/nix.conf", "a/x.nix", "top.nix"]);
  });

  test("a file named is taken as it is, whatever it is called", async () => {
    expect(await nixFiles([join(dir, "a/notes.txt")])).toEqual([join(dir, "a/notes.txt")]);
  });

  test("a path that is not there is told, not a crash", async () => {
    await expect(nixFiles([join(dir, "nope")])).rejects.toThrow(MissingPath);
  });
});
