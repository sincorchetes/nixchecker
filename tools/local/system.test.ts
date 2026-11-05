import { describe, expect, test } from "bun:test";
import { UsageError } from "./cli-args";
import { systemFor } from "./system";

const on = (system: string) => async () => system;

describe("systemFor", () => {
  test("a system asked for is used when it suits the target", async () => {
    expect(await systemFor("aarch64-linux", "nixos", on("x86_64-linux"))).toBe("aarch64-linux");
    expect(await systemFor("x86_64-darwin", "nix-darwin", on("x86_64-linux"))).toBe(
      "x86_64-darwin",
    );
  });

  test("one of the wrong family is a usage error", async () => {
    await expect(systemFor("x86_64-linux", "nix-darwin", on("aarch64-darwin"))).rejects.toThrow(
      UsageError,
    );
    await expect(systemFor("aarch64-darwin", "nixos", on("x86_64-linux"))).rejects.toThrow(
      "--system aarch64-darwin does not suit nixos",
    );
  });

  test("left out, it is the system of this machine when that suits, else the first of the family", async () => {
    expect(await systemFor(undefined, "nixos", on("aarch64-linux"))).toBe("aarch64-linux");
    expect(await systemFor(undefined, "nix-darwin", on("x86_64-linux"))).toBe("aarch64-darwin");
    expect(await systemFor(undefined, "home-manager", on("riscv64-linux"))).toBe("x86_64-linux");
  });
});
