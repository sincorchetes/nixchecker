import { describe, expect, test } from "bun:test";
import { original } from "./flake";

describe("name the file of a flake", () => {
  test("the copy in the store becomes the file written", () => {
    expect(original("/nix/store/abc-source/flake.nix", "/home/u/box")).toBe(
      "/home/u/box/flake.nix",
    );
  });

  test("other files and no file stay as they are", () => {
    expect(original("/nix/store/abc-nixpkgs/x.nix", "/h")).toBe("/nix/store/abc-nixpkgs/x.nix");
    expect(original(undefined, "/h")).toBeUndefined();
  });
});
