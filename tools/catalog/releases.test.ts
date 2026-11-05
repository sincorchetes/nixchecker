import { describe, expect, test } from "bun:test";
import { newerRelease } from "./releases";

const known = ["26.05", "25.11", "unstable"];
const nixpkgs = [
  "master",
  "nixos-unstable",
  "nixos-25.05",
  "nixos-25.11",
  "nixos-26.05",
  "release-26.11",
];

describe("newerRelease", () => {
  test("says nothing while every release has its catalog", () => {
    expect(newerRelease(known, nixpkgs, ["release-26.05"])).toBeUndefined();
  });

  test("names the new release, and whether Home Manager has it too", () => {
    const branches = [...nixpkgs, "nixos-26.11"];
    expect(newerRelease(known, branches, ["release-26.05"])).toEqual({
      release: "26.11",
      homeManager: false,
    });
    expect(newerRelease(known, branches, ["release-26.05", "release-26.11"])).toEqual({
      release: "26.11",
      homeManager: true,
    });
  });

  test("takes the newest when there are several, ordering by year and then month", () => {
    const found = newerRelease(known, ["nixos-26.11", "nixos-27.05", "nixos-26.06"], []);
    expect(found?.release).toBe("27.05");
  });

  test("ignores branches that are not releases, and older ones", () => {
    expect(
      newerRelease(known, ["nixos-24.11", "nixos-26.11-small", "backport-26.11", " "], []),
    ).toBeUndefined();
  });

  test("does not mind `unstable` among what is known", () => {
    expect(newerRelease(["unstable"], ["nixos-25.11"], [])?.release).toBe("25.11");
  });
});
