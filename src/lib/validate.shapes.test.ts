import { describe, expect, test } from "bun:test";
import type { IndexedOption } from "./catalog";
import { fixtures } from "./catalog/fixtures";
import { splitPath } from "./catalog/path";
import { buildTree } from "./catalog/tree";
import { type Report, validate } from "./validate";

const codesOf = (report: Report) => report.diagnostics.map((d) => d.code);

describe("attributes written below a list option", () => {
  const lists = {
    ...fixtures,
    nixos: buildTree([
      { path: "w.commands", type: "list", values: ["attrs"], segs: ["w", "commands"] },
      { path: "w.commands.*.command", type: "str", segs: ["w", "commands", "*", "command"] },
    ]),
  };
  const report = (src: string) => validate(src, "nixos", lists);

  test("are a type error, once per list", () => {
    const { diagnostics } = report('{ w.commands.a.command = "x"; w.commands.b.command = "y"; }');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: "type-mismatch",
      params: { path: "w.commands", expected: "list", got: "attrs" },
    });
  });

  test("a list written as a list is fine", () => {
    expect(report('{ w.commands = [ { command = "x"; } ]; }').diagnostics).toEqual([]);
  });
});

describe("names with dots", () => {
  const dotted = {
    ...fixtures,
    nixos: buildTree(
      [
        { path: "sysctl", type: "attrs", values: ["str", "int"] },
        { path: 'cfg."Mod.Web".port', type: "int" },
      ].map((entry) => ({ ...entry, segs: splitPath(entry.path) })) as IndexedOption[],
    ),
  };
  const report = (src: string) => validate(src, "nixos", dotted);

  test("a quoted name with dots is checked as one name", () => {
    expect(report('{ cfg."Mod.Web".port = 1; }').diagnostics).toEqual([]);
    expect(report('{ cfg."Mod.Web".port = "x"; }').diagnostics[0]).toMatchObject({
      code: "type-mismatch",
    });
  });

  test("the same pieces as separate names are another path", () => {
    expect(codesOf(report('{ cfg.Mod.Web.port = "x"; }'))).toEqual(["unknown-option"]);
  });
});
