import { describe, expect, test } from "bun:test";
import type { Result } from "./check-file";
import { toSarif } from "./sarif";

const result = (items: Result["items"]): Result => ({
  file: "/work/a.nix",
  target: "nixos",
  version: "26.05",
  evaluated: true,
  coverage: { checked: 1, total: 1 },
  catalog: { name: "nixos-26.05", source: "x", revisions: {} },
  items,
});

// What SARIF 2.1.0 requires of a log and of each result that code scanning reads (spec sections 3.13,
// 3.14, 3.27 and 3.30), checked here by hand: the full schema is not available offline.
function problemsWith(log: ReturnType<typeof toSarif>): string[] {
  const problems: string[] = [];
  const need = (ok: boolean, what: string) => ok || problems.push(what);
  need(log.version === "2.1.0", "version is 2.1.0");
  need(typeof log.$schema === "string", "$schema is a string");
  need(Array.isArray(log.runs) && log.runs.length > 0, "there is a run");
  for (const run of log.runs) {
    need(typeof run.tool.driver.name === "string", "the tool has a name");
    for (const r of run.results) {
      need(typeof r.ruleId === "string" && r.ruleId.length > 0, "a result has a rule");
      need(["none", "note", "warning", "error"].includes(r.level), `level ${r.level} is valid`);
      need(typeof r.message.text === "string" && r.message.text.length > 0, "a message has text");
      need(r.locations.length > 0, "a result has a location");
      for (const { physicalLocation: p } of r.locations) {
        need(typeof p.artifactLocation.uri === "string", "a location has a uri");
        const region = (p as { region?: { startLine: number; startColumn: number } }).region;
        if (region) {
          need(Number.isInteger(region.startLine) && region.startLine >= 1, "startLine is a line");
          need(
            Number.isInteger(region.startColumn) && region.startColumn >= 1,
            "startColumn is a column",
          );
        }
      }
    }
  }
  return problems;
}

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
    const broken = toSarif([
      result([{ level: "static", severity: "error", message: "", line: 0, col: 1 }]),
    ]);
    expect(problemsWith(broken).length).toBeGreaterThan(0);
  });
});
