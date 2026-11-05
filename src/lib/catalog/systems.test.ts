import { expect, test } from "bun:test";
import { DEFAULT_SYSTEM, isDarwin, SYSTEMS, systemsFor } from "./systems";

test("the default system is one of the systems", () => {
  expect(SYSTEMS).toContain(DEFAULT_SYSTEM);
});

test("macOS systems are told from the Linux ones", () => {
  expect(SYSTEMS.filter(isDarwin)).toEqual(["aarch64-darwin", "x86_64-darwin"]);
});

test("each target offers the systems it runs on", () => {
  expect(systemsFor("nix-darwin")).toEqual(["aarch64-darwin", "x86_64-darwin"]);
  expect(systemsFor("nixos")).toEqual(["x86_64-linux", "aarch64-linux"]);
  expect(systemsFor("disko")).toEqual(systemsFor("nixos"));
  for (const target of ["auto", "home-manager", "nix-conf", "flake"]) {
    expect(systemsFor(target)).toEqual(SYSTEMS);
  }
});
