import { describe, expect, test } from "bun:test";
import { HELP, parseCommand, UsageError } from "./cli-args";
import { mapLimit } from "./pool";

const usage = (...args: string[]) => {
  try {
    parseCommand(args);
  } catch (error) {
    return error instanceof UsageError ? error.message : "not a usage error";
  }
  return undefined;
};

describe("command line", () => {
  test("files and options, in any order, with the defaults", () => {
    const command = parseCommand(["--static", "a.nix", "--target", "nixos", "b.nix"]);
    expect(command).toMatchObject({
      paths: ["a.nix", "b.nix"],
      target: "nixos",
      static: true,
      format: "text",
      release: "26.05",
    });
    expect(parseCommand(["--json", "a.nix"]).format).toBe("json");
    expect(parseCommand(["--format", "sarif", "a.nix"]).format).toBe("sarif");
    expect(parseCommand(["-j", "2", "a.nix"]).jobs).toBe(2);
  });

  test("--help and --version need no file", () => {
    expect(parseCommand(["--help"])).toMatchObject({ help: true, paths: [] });
    expect(parseCommand(["-v"]).version).toBe(true);
    expect(HELP).toContain("Usage: nixchecker");
  });

  test("every mistake is a usage error that says what was wrong", () => {
    expect(usage()).toBe("no file given");
    expect(usage("--bogus", "a.nix")).toContain("--bogus");
    expect(usage("--format", "xml", "a.nix")).toContain("--format is one of");
    expect(usage("--release", "1.0", "a.nix")).toContain("--release is one of");
    expect(usage("--target", "windows", "a.nix")).toContain("--target is one of");
    expect(usage("--jobs", "0", "a.nix")).toContain("--jobs");
    expect(usage("--jobs", "many", "a.nix")).toContain("--jobs");
    expect(usage("a.nix")).toBeUndefined();
  });
});

describe("mapLimit", () => {
  test("returns the results in the order of the items, whatever order they finish in", async () => {
    const out = await mapLimit([30, 5, 15], 3, async (ms) => {
      await Bun.sleep(ms);
      return ms;
    });
    expect(out).toEqual([30, 5, 15]);
  });

  test("never runs more than the limit at once", async () => {
    let running = 0;
    let most = 0;
    await mapLimit([1, 2, 3, 4, 5, 6], 2, async () => {
      running++;
      most = Math.max(most, running);
      await Bun.sleep(5);
      running--;
    });
    expect(most).toBe(2);
  });

  test("an empty list is an empty answer", async () => {
    expect(await mapLimit([], 4, async (x) => x)).toEqual([]);
  });
});
