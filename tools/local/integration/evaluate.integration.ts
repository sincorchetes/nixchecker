// The command line against real Nix, on the cases the unit tests can only imitate: what Nix accepts and
// the analysis does not know, an error in an imported file, and a part of a system.
// `devenv shell -- integration` (needs Nix; the first run builds the pinned sources).
import { beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { problemsWith } from "../sarif-schema";
import { evaluate, scratch } from "./support";

const TIME = 900_000;
let dir: string;
const write = (name: string, text: string) => Bun.write(join(dir, name), text);

beforeAll(async () => {
  dir = await scratch();
  // A module of the user's that declares an option of its own, and one that sets it.
  await write(
    "mine.nix",
    `{ lib, ... }: { options.my.greeting = lib.mkOption { type = lib.types.str; default = "hi"; }; }\n`,
  );
  await write(
    "uses-mine.nix",
    `{ ... }: {\n  imports = [ ./mine.nix ];\n  my.greeting = "hello";\n}\n`,
  );
  // A module that imports another with a value of the wrong type in it.
  await write("child.nix", `{ ... }: {\n  networking.hostName = 5;\n}\n`);
  await write("parent.nix", `{ ... }: {\n  imports = [ ./child.nix ];\n}\n`);
  // Two wrong values in one module: Nix stops at the first, and the report must have both.
  await write(
    "two-wrong.nix",
    `{ ... }: {\n  networking.hostName = 5;\n  services.openssh.ports = "x";\n  services.openssh.enable = true;\n}\n`,
  );
  // An option that does not exist next to two wrong values: Nix stops at the one that does not exist.
  await write(
    "mixed.nix",
    `{ ... }: {\n  networking.hostName = 5;\n  services.openssh.enabel = true;\n  services.openssh.ports = "x";\n}\n`,
  );
  await write("good.nix", `{ ... }: {\n  networking.hostName = "box";\n}\n`);
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

describe("more than the first error", () => {
  test(
    "with --partial, every wrong value is confirmed by Nix in one run",
    async () => {
      const run = await evaluate(
        "--format",
        "json",
        "--partial",
        "--target",
        "nixos",
        join(dir, "two-wrong.nix"),
      );
      const confirmed = run.items.filter((i) => i.level === "evaluation");
      expect(confirmed.map((i) => i.line)).toEqual([2, 3]);
      expect(confirmed.map((i) => i.message).join("\n")).toContain("services.openssh.ports");
      // What Nix confirmed is not also shown as a static guess at the same place.
      expect(run.items.filter((i) => i.level === "static")).toEqual([]);
    },
    TIME,
  );
});

describe("an option that does not exist does not hide the wrong values", () => {
  test(
    "with --partial, it and every wrong value are confirmed in one run",
    async () => {
      const run = await evaluate(
        "--format",
        "json",
        "--partial",
        "--target",
        "nixos",
        join(dir, "mixed.nix"),
      );
      const confirmed = run.items.filter((i) => i.level === "evaluation");
      expect(confirmed.map((i) => i.line).sort()).toEqual([2, 3, 4]);
      const text = confirmed.map((i) => i.message).join("\n");
      expect(text).toContain("services.openssh.enabel does not exist");
      expect(text).toContain("networking.hostName");
      expect(text).toContain("services.openssh.ports");
    },
    TIME,
  );
});

describe("a part of a system", () => {
  test(
    "with --partial, only what the file sets is read",
    async () => {
      const run = await evaluate(
        "--format",
        "json",
        "--partial",
        "--target",
        "nixos",
        join(dir, "good.nix"),
      );
      expect(run.items).toEqual([]);
      expect(run.code).toBe(0);
    },
    TIME,
  );

  test(
    "without it, the assertions of a whole system are part of the answer",
    async () => {
      const run = await evaluate("--format", "json", "--target", "nixos", join(dir, "good.nix"));
      expect(run.code).toBe(1);
      expect(run.items.map((i) => i.message).join("\n")).toContain("fileSystems");
    },
    TIME,
  );

  test(
    "with --partial, a wrong value is still found",
    async () => {
      const run = await evaluate(
        "--format",
        "json",
        "--partial",
        "--target",
        "nixos",
        join(dir, "child.nix"),
      );
      expect(run.code).toBe(1);
      expect(run.items[0]).toMatchObject({ level: "evaluation", line: 2, col: 3 });
    },
    TIME,
  );
});
