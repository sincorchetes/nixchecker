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
