// The command line against real Nix, on the cases the unit tests can only imitate: what Nix accepts and
// the analysis does not know, and an error in an imported file.
// `devenv shell -- integration` (needs Nix; the first run builds the pinned sources).
import { beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { problemsWith } from "../sarif-schema";
import { writeModules } from "./modules";
import { evaluate, scratch } from "./support";

const TIME = 900_000;
let dir: string;

beforeAll(async () => {
  dir = await scratch();
  await writeModules(dir);
});

describe("what Nix accepts and the analysis does not know", () => {
  test(
    "an option a module of your own declares is not a false positive any more",
    async () => {
      const without = await evaluate(
        "--format",
        "json",
        "--static",
        "--target",
        "nixos",
        join(dir, "uses-mine.nix"),
      );
      // On its own, the analysis cannot know it...
      expect(without.items.some((i) => i.code === "unknown-option")).toBe(true);

      // ...and with Nix, which does, that finding is dropped.
      const run = await evaluate(
        "--format",
        "json",
        "--partial",
        "--target",
        "nixos",
        join(dir, "uses-mine.nix"),
      );
      expect(run.items).toEqual([]);
      expect(run.code).toBe(0);
    },
    TIME,
  );
});

describe("an error inside an imported file", () => {
  test(
    "is placed in that file, at its line and column",
    async () => {
      const run = await evaluate(
        "--format",
        "json",
        "--partial",
        "--target",
        "nixos",
        join(dir, "parent.nix"),
      );
      expect(run.code).toBe(1);
      expect(run.items).toHaveLength(1);
      expect(run.items[0]).toMatchObject({
        level: "evaluation",
        severity: "error",
        file: join(dir, "child.nix"),
        line: 2,
        col: 3,
      });
    },
    TIME,
  );

  test(
    "is attributed to that file in SARIF too",
    async () => {
      const run = await evaluate(
        "--format",
        "sarif",
        "--partial",
        "--target",
        "nixos",
        join(dir, "parent.nix"),
      );
      // What was printed is valid SARIF by the official schema, and not only what the unit tests build.
      expect(problemsWith(JSON.parse(run.out))).toEqual([]);
      const [result] = JSON.parse(run.out).runs[0].results;
      expect(result.locations[0].physicalLocation).toMatchObject({
        artifactLocation: { uri: join(dir, "child.nix") },
        region: { startLine: 2, startColumn: 3 },
      });
    },
    TIME,
  );
});

describe("the system the configuration is built for", () => {
  test(
    "an assertion about the platform holds on one system and fails on the other",
    async () => {
      const file = join(dir, "only-arm.nix");
      await Bun.write(
        file,
        `{ pkgs, ... }: {
  boot.loader.grub.enable = false;
  fileSystems."/" = { device = "none"; fsType = "tmpfs"; };
  system.stateVersion = "25.05";
  assertions = [ { assertion = pkgs.stdenv.hostPlatform.isAarch64; message = "only on ARM"; } ];
}
`,
      );
      const on = (system: string) =>
        evaluate("--format", "json", "--target", "nixos", "--system", system, file);
      const arm = await on("aarch64-linux");
      expect(arm.items.some((i) => i.message.includes("only on ARM"))).toBe(false);
      const x86 = await on("x86_64-linux");
      expect(x86.items.some((i) => i.message.includes("only on ARM"))).toBe(true);
    },
    TIME,
  );
});

describe("nix-darwin", () => {
  const on = (file: string, ...more: string[]) =>
    evaluate("--format", "json", "--partial", "--target", "nix-darwin", ...more, file);

  test(
    "Nix confirms a wrong value in a Mac configuration, evaluated from any machine",
    async () => {
      const file = join(dir, "mac.nix");
      await Bun.write(file, '{ system.defaults.dock.autohide = "yes"; }\n');
      const run = await on(file);
      expect(run.code).toBe(1);
      expect(run.items.some((i) => i.level === "evaluation" && i.severity === "error")).toBe(true);
    },
    TIME,
  );

  test(
    "a system of the wrong family is a usage error",
    async () => {
      const file = join(dir, "mac-ok.nix");
      await Bun.write(file, "{ system.defaults.dock.autohide = true; }\n");
      const run = await evaluate("--target", "nix-darwin", "--system", "x86_64-linux", file);
      expect(run.code).toBe(2);
      expect(run.err).toContain("does not suit nix-darwin");
      expect((await on(file, "--system", "aarch64-darwin")).code).toBe(0);
    },
    TIME,
  );
});

describe("nix.conf", () => {
  test(
    "a setting Nix does not know is a warning, as it is for Nix, and does not fail the run",
    async () => {
      const file = join(dir, "unknown.conf");
      await Bun.write(file, "keep-goin = true\n");
      const run = await evaluate("--format", "json", "--target", "nix-conf", file);
      expect(run.code).toBe(0);
      expect(run.items.map((i) => [i.code, i.severity])).toEqual([["unknown-option", "warning"]]);
    },
    TIME,
  );

  test(
    "is recognized by its shape, checked without evaluating, and found in a directory",
    async () => {
      const conf = join(dir, "etc");
      await Bun.$`mkdir -p ${conf}`;
      await Bun.write(join(conf, "nix.conf"), "experimental-features = flakes\ncores = abc\n");
      const run = await evaluate("--format", "json", conf);
      expect(run.code).toBe(1);
      expect(run.items.map((i) => [i.code, i.line])).toEqual([["type-mismatch", 2]]);
      expect(JSON.parse(run.out).results[0]).toMatchObject({
        target: "nix-conf",
        evaluated: false,
      });
    },
    TIME,
  );
});
