import { describe, expect, test } from "bun:test";
import type { Result } from "./check-file";
import { toSarif } from "./sarif";
import { problemsWith } from "./sarif-schema";

const result = (items: Result["items"]): Result => ({
  file: "/work/a.nix",
  target: "nixos",
  version: "26.05",
  evaluated: true,
  coverage: { checked: 1, total: 1 },
  catalog: { name: "nixos-26.05", source: "x", revisions: {} },
  items,
});

describe("SARIF", () => {
  test("a log with every kind of finding is valid", () => {
    const log = toSarif([
      result([
        {
          level: "static",
          severity: "error",
          message: "a",
          code: "type-mismatch",
          line: 1,
          col: 3,
        },
        {
          level: "syntax",
          severity: "error",
          message: "b",
          code: "syntax-unexpected",
          line: 2,
          col: 1,
        },
        { level: "evaluation", severity: "warning", message: "c" },
        {
          level: "evaluation",
          severity: "error",
          message: "d",
          file: "/work/b.nix",
          line: 4,
          col: 2,
        },
        { level: "evaluation", severity: "error", message: "e", config: "nixosConfigurations.box" },
      ]),
    ]);
    expect(problemsWith(log)).toEqual([]);
    expect(log.runs[0]?.results).toHaveLength(5);
  });

  test("a finding without a place has a location without a region, not a bad one", () => {
    const [only] =
      toSarif([result([{ level: "evaluation", severity: "error", message: "x" }])]).runs[0]
        ?.results ?? [];
    expect(only?.locations[0]?.physicalLocation).toEqual({
      artifactLocation: { uri: "/work/a.nix" },
    });
  });

  test("a finding is attributed to the file it is in, and keeps its configuration", () => {
    const log = toSarif([
      result([
        {
          level: "evaluation",
          severity: "error",
          message: "x",
          file: "/work/b.nix",
          line: 4,
          col: 2,
          config: "homeConfigurations.u",
        },
      ]),
    ]);
    const [one] = log.runs[0]?.results ?? [];
    expect(one?.locations[0]?.physicalLocation.artifactLocation.uri).toBe("/work/b.nix");
    expect(one?.properties).toEqual({ configuration: "homeConfigurations.u" });
  });

  test("a validator that finds problems is not blind", () => {
    const log = toSarif([
      result([{ level: "static", severity: "error", message: "x", line: 1, col: 1 }]),
    ]);
    // A region must start at line 1 or later: this log is not valid, and the schema must say so.
    const broken = JSON.parse(JSON.stringify(log));
    broken.runs[0].results[0].locations[0].physicalLocation.region.startLine = 0;
    expect(problemsWith(broken).join()).toContain("startLine");
    expect(problemsWith(log)).toEqual([]);
    expect(problemsWith({ version: "2.0.0", runs: [] })).not.toEqual([]);
  });
});
