import { describe, expect, test } from "bun:test";
import { fixtures } from "./fixtures";
import { candidates, findExact, findOwner, knownPrefix, siblings } from "./tree";

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
