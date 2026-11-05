import { describe, expect, test } from "bun:test";
import { cliCommand } from "./cli-command";

describe("cliCommand", () => {
  test("a versioned target names its release and system", () => {
    expect(cliCommand("nixos", "25.11", "aarch64-linux")).toBe(
      "nix run github:sincorchetes/nixchecker -- my-config.nix --target nixos --release 25.11 --system aarch64-linux",
    );
    expect(cliCommand("nix-darwin", "26.05", "aarch64-darwin")).toContain(
      "--release 26.05 --system aarch64-darwin",
    );
  });

  test("disko has no release, and a flake or nix.conf has neither release nor system", () => {
    expect(cliCommand("disko", "26.05", "x86_64-linux")).toEndWith(
      "--target disko --system x86_64-linux",
    );
    expect(cliCommand("flake", "26.05", "x86_64-linux")).toEndWith("--target flake");
    expect(cliCommand("nix-conf", "26.05", "x86_64-linux")).toEndWith("--target nix-conf");
  });
});
