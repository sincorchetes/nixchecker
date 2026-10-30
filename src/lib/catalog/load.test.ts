import { afterEach, describe, expect, test } from "bun:test";
import { loadCatalog } from "./load";
import { bucketOf } from "./shard";

describe("loadCatalog", () => {
  const one = `big~${bucketOf("one", 1)}`;
  const index = {
    source: "s",
    keys: ["a", "big", one],
    split: { big: { names: ["one"], buckets: 1 } },
  };
  const files: Record<string, unknown> = {
    "/base/catalog/disko/index.json": index,
    "/base/catalog/disko/a.json": [["a.b", "bool"]],
    "/base/catalog/disko/big.json": [["big", "set"]],
    [`/base/catalog/disko/${one}.json`]: [["big.one.x", "int"]],
  };
  const calls: string[] = [];
  const ok = (async (url: string) => {
    calls.push(url);
    return url in files ? Response.json(files[url]) : new Response("no", { status: 404 });
  }) as unknown as typeof fetch;

  afterEach(() => {
    calls.length = 0;
  });

  test("downloads the index and only the shards a file touches, once", async () => {
    const first = await loadCatalog("disko", "unstable", "/base/", [["a", "b"]], ok);
    expect(first.source).toBe("s");
    expect(first.entries.map((e) => e.path)).toEqual(["a.b"]);
    const second = await loadCatalog(
      "disko",
      "unstable",
      "/base/",
      [
        ["a", "b"],
        ["big", "one", "x"],
      ],
      ok,
    );
    expect(second).toBe(first);
    expect(second.entries.map((e) => e.path)).toEqual(["a.b", "big", "big.one.x"]);
    expect(calls).toEqual([
      "/base/catalog/disko/index.json",
      "/base/catalog/disko/a.json",
      "/base/catalog/disko/big.json",
      `/base/catalog/disko/${one}.json`,
    ]);
  });

  test("versioned targets load from their own directory", async () => {
    files["/base/catalog/nixos-25.11/index.json"] = index;
    files["/base/catalog/nixos-25.11/a.json"] = [["a.b", "bool"]];
    const catalog = await loadCatalog("nixos", "25.11", "/base/", [["a", "b"]], ok);
    expect(catalog.entries.map((e) => e.path)).toEqual(["a.b"]);
    expect(calls[0]).toBe("/base/catalog/nixos-25.11/index.json");
  });

  test("does not keep failures, neither of the index nor of a shard", async () => {
    files["/base/catalog/flake/index.json"] = index;
    files["/base/catalog/flake/a.json"] = [["a.b", "bool"]];
    const failing = new Set<string>();
    const fetcher = (async (url: string) =>
      failing.has(url) ? new Response("no", { status: 503 }) : ok(url)) as unknown as typeof fetch;
    const load = () => loadCatalog("flake", "unstable", "/base/", [["a", "b"]], fetcher);

    failing.add("/base/catalog/flake/index.json");
    await expect(load()).rejects.toThrow("HTTP 503");
    failing.clear();
    failing.add("/base/catalog/flake/a.json");
    await expect(load()).rejects.toThrow("HTTP 503");
    failing.clear();
    expect((await load()).entries.length).toBe(1);
  });
});
