import { describe, expect, test } from "bun:test";
import { fixtures } from "./fixtures";
import {
  addRoots,
  buildTree,
  candidates,
  childrenOf,
  findExact,
  findOwner,
  knownPrefix,
  siblings,
} from "./tree";

const tree = fixtures.nixos;
const path = (p: string) => p.split(".");

describe("option tree", () => {
  test("finds exact options, through wildcards too", () => {
    expect(findExact(tree, path("services.openssh.enable"))?.type).toBe("bool");
    expect(findExact(tree, path("users.users.alice.isNormalUser"))?.type).toBe("bool");
    expect(findExact(tree, path("services.openssh"))).toBeUndefined();
    expect(findExact(tree, path("nope.nope"))).toBeUndefined();
  });

  test("finds the shortest opaque owner above a path", () => {
    expect(findOwner(tree, path("services.openssh.settings.PermitRootLogin"))?.path).toBe(
      "services.openssh.settings",
    );
    expect(findOwner(tree, path("services.openssh.settings"))).toBeUndefined();
    expect(findOwner(tree, path("services.openssh.enable.x"))).toBeUndefined();
  });

  test("measures how much of a path is known", () => {
    expect(knownPrefix(tree, path("services.openssh.enable"))).toBe(3);
    expect(knownPrefix(tree, path("services.openssh.enabel"))).toBe(2);
    expect(knownPrefix(tree, path("zzz.a"))).toBe(0);
  });

  test("lists same-depth candidates, never hidden ones, filling wildcards in", () => {
    const found = candidates(tree, path("users.users.bob"));
    expect(found.has("users.users.bob")).toBe(true);
    expect(candidates(tree, path("boot.cleanTmpDir")).has("boot.cleanTmpDir")).toBe(false);
  });

  test("lists siblings of the first unknown segment that still lead to a real option", () => {
    expect([...siblings(tree, path("services.openssh.enabel"), 2)]).toContain(
      "services.openssh.enable",
    );
    expect([...siblings(tree, path("users.users.bob.isNormalUsr"), 3)]).toContain(
      "users.users.bob.isNormalUser",
    );
    expect(siblings(tree, path("services.openssh.enabel.x"), 2).size).toBe(0);
  });
});

describe("childrenOf", () => {
  test("lists the names that follow a path, through wildcards, without `*` or hidden ones", () => {
    expect(childrenOf(tree, path("services.openssh"))).toEqual(["enable", "ports", "settings"]);
    expect(childrenOf(tree, path("users.users.alice"))).toEqual([
      "description",
      "extraGroups",
      "isNormalUser",
    ]);
    expect(childrenOf(tree, path("boot"))).toEqual([]);
    expect(childrenOf(tree, [])).toContain("networking");
    expect(childrenOf(tree, path("nope"))).toEqual([]);
  });
});

test("a partial node does not list its children", () => {
  const partial = buildTree([
    { path: "a.b", type: "bool", segs: ["a", "b"] },
    { path: "a.c", type: "bool", segs: ["a", "c"] },
  ]);
  expect(childrenOf(partial, ["a"])).toEqual(["b", "c"]);
  (partial.kids.get("a") as { partial?: boolean }).partial = true;
  expect(childrenOf(partial, ["a"])).toEqual([]);
});

test("addRoots makes the roots known, without overwriting what is there", () => {
  const roots = buildTree([{ path: "a.b", type: "bool", segs: ["a", "b"] }]);
  addRoots(roots, ["a", "z"]);
  expect([...roots.kids.keys()]).toEqual(["a", "z"]);
  expect(roots.kids.get("a")?.kids.has("b")).toBe(true);
  expect(roots.kids.get("z")?.visible).toBe(true);
});

describe("owner of a value below an attrsOf submodule", () => {
  const kernels = buildTree([
    { path: "k", type: "attrs", values: ["attrs"], segs: ["k"] },
    { path: "k.*.paths", type: "attrs", values: ["path"], segs: ["k", "*", "paths"] },
  ]);

  test("is the deepest option that knows its values", () => {
    expect(findOwner(kernels, path("k.x.paths.a"))?.path).toBe("k.*.paths");
  });

  test("falls back to the free-form set above when nothing below fits", () => {
    expect(findOwner(kernels, path("k.x.other.a"))?.path).toBe("k");
  });
});
