import { afterEach, describe, expect, test } from "bun:test";
import { analyze, check } from "../validate";
import { convert, mapType, toRow } from "./convert";
import { decodeRow, loadCatalog } from "./load";
import { extractRenames } from "./renames";
import { BUCKET_ROWS, bucketOf, planner, SPLIT_LIMIT, shardFile, toShards } from "./shard";
import { childrenOf } from "./tree";
import { type CatalogIndex, type OptionRow, opt } from "./types";
import { catalogName, DEFAULT_VERSION, VERSIONS } from "./versions";

describe("mapType", () => {
  const type = (description: string) => mapType(description).type;

  test("maps scalar types", () => {
    expect(type("boolean")).toBe("bool");
    expect(type("null or boolean")).toBe("bool");
    expect(type("signed integer")).toBe("int");
    expect(type("16 bit unsigned integer; between 0 and 65535 (both inclusive)")).toBe("int");
    expect(type("null or absolute path")).toBe("str");
    expect(type('strings concatenated with "\\n"')).toBe("str");
    expect(type("null or (An absolute path)")).toBe("str");
  });

  test("reads a list before the type of its elements", () => {
    expect(type("list of 16 bit unsigned integer; between 0 and 65535 (both inclusive)")).toBe(
      "list",
    );
    expect(type("non-empty list of string")).toBe("list");
    expect(type("null or (list of string)")).toBe("list");
  });

  test("tells strict, free-form and open sets apart", () => {
    expect(type("attribute set of (submodule)")).toBe("container");
    expect(type("attribute set of signed integer")).toBe("container");
    expect(type("TOML value")).toBe("container");
    expect(type("open submodule of (JSON value)")).toBe("attrs");
  });

  test("parses enums, including numeric and boolean ones", () => {
    expect(mapType('one of "a", "b"')).toEqual({ type: "enum", values: ["a", "b"] });
    expect(mapType("null or (one of x,y)")).toEqual({ type: "enum", values: ["x", "y"] });
    expect(type("one of 1, 2, 3")).toBe("int");
    expect(type("one of true, false")).toBe("bool");
  });

  test("does not guess for alternatives or unknown types", () => {
    expect(type("(attribute set of string) or list of string")).toBe("any");
    expect(type("string or boolean")).toBe("any");
    expect(type("package")).toBe("any");
    expect(type("nixpkgs config")).toBe("any");
    expect(type("(a) or (b)")).toBe("any");
  });
});

describe("convert", () => {
  test("normalizes names and turns listed containers into strict sets", () => {
    const entries = convert({
      "users.users": { type: "attribute set of (submodule)" },
      "users.users.<name>.isNormalUser": { type: "boolean" },
      "environment.variables": { type: "attribute set of string" },
      "nix.settings": { type: "open submodule of (nix atom)" },
      "nix.settings.sandbox": { type: "boolean" },
    });
    expect(entries.map((e) => [e.path, e.type])).toEqual([
      ["environment.variables", "attrs"],
      ["nix.settings", "attrs"],
      ["nix.settings.sandbox", "bool"],
      ["users.users", "set"],
      ["users.users.*.isNormalUser", "bool"],
    ]);
  });

  test("adds hidden options without overriding documented ones", () => {
    const entries = convert({ "a.b": { type: "boolean" } }, ["a.b", "a.old", "a.<name>.x"]);
    expect(entries.map((e) => [e.path, e.type])).toEqual([
      ["a.*.x", "hidden"],
      ["a.b", "bool"],
      ["a.old", "hidden"],
    ]);
  });

  test("applies renames and entry overrides from the overlay", () => {
    const entries = convert(
      {
        "new.opt": { type: "boolean" },
        "keep.me": { type: "string" },
        "old.root": { type: "boolean" },
      },
      [],
      {
        renamed: { "old.opt": "new.opt", "old.gone": "missing.opt" },
        entries: [opt("keep.me", "int"), opt("extra", "list")],
      },
    );
    expect(entries).toEqual([
      { path: "extra", type: "list" },
      { path: "keep.me", type: "int" },
      { path: "new.opt", type: "bool" },
      { path: "old.gone", type: "any", renamedTo: "missing.opt" },
      { path: "old.opt", type: "bool", renamedTo: "new.opt" },
      { path: "old.root", type: "bool" },
    ]);
  });

  test("an overlay entry cancels the container promotion", () => {
    const entries = convert(
      { "a.c": { type: "attribute set of string" }, "a.c.d": { type: "string" } },
      [],
      {
        entries: [opt("a.c", "attrs")],
      },
    );
    expect(entries.find((e) => e.path === "a.c")?.type).toBe("attrs");
  });
});

describe("shards", () => {
  const entries = [
    opt("a", "bool"),
    opt("b", "enum", { values: ["x", "y"] }),
    opt("c", "hidden", { renamedTo: "d" }),
  ];

  test("round-trips entries through the compact row format", () => {
    expect(entries.map(toRow)).toEqual([
      ["a", "bool"],
      ["b", "enum", ["x", "y"]],
      ["c", "hidden", "d"],
    ]);
    const back = entries.map(toRow).map(decodeRow);
    expect(back.map(({ segs, ...e }) => e)).toEqual(entries);
    expect(decodeRow(["x.*.y", "str"]).segs).toEqual(["x", "*", "y"]);
  });

  const big = [
    opt("net.a", "bool"),
    opt("big", "set"),
    opt("big.one.x", "bool"),
    opt("big.one.y", "bool"),
    opt("big.two.x", "bool"),
    opt("big.*.z", "bool"),
  ];

  test("keeps small roots whole and spreads big ones over buckets by second segment", () => {
    const { index, shards } = toShards("src", big, 3, 2);
    expect(index.split).toEqual({ big: { names: ["*", "one", "two"], buckets: 3 } });
    expect(index.keys).toContain("net");
    expect(index.keys).toContain(`big~${bucketOf("one", 3)}`);
    expect(shards.big).toEqual([["big", "set"]]);
    expect(Object.values(shards).flat().length).toBe(big.length);
    expect(toShards("src", big).index.split).toEqual({});
    expect(shardFile("big~1")).toBe("big~1.json");
    expect(bucketOf("one", 3)).toBe(bucketOf("one", 3));
    expect(bucketOf("x", 1)).toBe(0);
    expect(SPLIT_LIMIT).toBeGreaterThan(BUCKET_ROWS);
  });

  test("plans the shards a path needs, falling back to the nearest on typos", () => {
    const plan = planner(toShards("src", big, 3, 2).index);
    const bucket = (name: string) => `big~${bucketOf(name, 3)}`;
    expect(plan(["net", "a"])).toEqual(["net"]);
    expect(plan(["big", "one", "x"])).toEqual(["big", bucket("one")]);
    expect(plan(["big", "tow", "x"])).toEqual(["big", bucket("*")]);
    expect(plan(["bgi", "one"])).toEqual(["big", bucket("one")]);
    expect(plan(["big"])).toEqual(["big"]);
    expect(plan(["zzzzzz", "x"])).toEqual([]);
    const noWild = planner(
      toShards(
        "src",
        big.filter((e) => !e.path.includes("*")),
        3,
        2,
      ).index,
    );
    expect(noWild(["big", "tow"])).toEqual(["big", bucket("two")]);
    expect(noWild(["big", "qqqqqqq"])).toEqual(["big"]);
  });
});

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
    expect(await has("disko", "disko.devices.disk.*.device", "str")).toBe(true);
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

describe("extractRenames", () => {
  test("reads static renames in every form, and skips the rest", () => {
    const source = `
      (mkRenamedOptionModule [ "services" "foo" "enable" ] [ "services" "bar" "enable" ])
      (lib.mkRenamedOptionModule
        [ "a" "b" ]
        [ "c" "d" ])
      (mkRenamedOptionModuleWith {
        sinceRelease = 2505;
        from = [ "x" "y" ];
        to = [ "z" ];
      })
      (mkRenamedOptionModule [ "p" opt ] [ "q" ])
      (mkRenamedOptionModule [ "p" "\${name}" ] [ "q" ])
      (mkRenamedOptionModule [ "same" ] [ "same" ])
    `;
    expect(extractRenames(source)).toEqual({
      "services.foo.enable": "services.bar.enable",
      "a.b": "c.d",
      "x.y": "z",
    });
    expect(extractRenames("nothing here")).toEqual({});
  });

  test("convert never lets a rename shadow a documented option or its parent", () => {
    const entries = convert(
      { "new.opt": { type: "boolean" }, "kept.child": { type: "boolean" } },
      ["old.opt"],
      {
        renamed: {
          "old.opt": "new.opt",
          "new.opt": "x",
          kept: "y",
          "new.gone": "new.opt",
          "gone.opt": "new.opt",
        },
      },
    );
    const byPath = Object.fromEntries(entries.map((e) => [e.path, e]));
    expect(byPath["old.opt"]).toMatchObject({ type: "bool", renamedTo: "new.opt" });
    expect(byPath["new.gone"]).toMatchObject({ renamedTo: "new.opt" });
    expect(byPath["gone.opt"]).toBeUndefined();
    expect(byPath["new.opt"]?.renamedTo).toBeUndefined();
    expect(byPath.kept?.renamedTo).toBeUndefined();
  });
});
