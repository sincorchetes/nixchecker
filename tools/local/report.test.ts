import { describe, expect, test } from "bun:test";
import type { Assignment } from "../../src/lib/nix/scan";
import { fromFinding, type How, isImported, type Located, printText } from "./report";

const assignments = [{ path: ["networking", "hostName"], line: 3, col: 5 }] as Assignment[];
const finding = { kind: "type-error", option: "networking.hostName", message: "bad" } as const;

describe("place a finding of Nix", () => {
  test("in the checked file, at the assignment", () => {
    const placed = fromFinding({ ...finding, file: "./a.nix" }, assignments, "a.nix");
    expect(placed).toEqual({
      level: "evaluation",
      severity: "error",
      message: "bad",
      line: 3,
      col: 5,
    });
  });

  test("in an imported file, with its name and the place in that file", () => {
    const there = [{ path: ["networking", "hostName"], line: 1, col: 19 }] as Assignment[];
    const placed = fromFinding({ ...finding, file: "/x/other.nix" }, there, "a.nix");
    expect(placed).toMatchObject({ file: "/x/other.nix", line: 1, col: 19, message: "bad" });
  });

  test("an imported file that could not be read still names the file, with no place", () => {
    const placed = fromFinding({ ...finding, file: "/x/other.nix" }, [], "a.nix");
    expect(placed.file).toBe("/x/other.nix");
    expect(placed.line).toBeUndefined();
  });

  test("the configuration of a flake it was found in is data of its own", () => {
    const placed = fromFinding({ ...finding, config: "nixosConfigurations.box" }, [], "flake.nix");
    expect(placed).toMatchObject({ config: "nixosConfigurations.box", message: "bad" });
  });

  test("a file is imported when it is not the one checked", () => {
    expect(isImported({ ...finding, file: "./a.nix" }, "a.nix")).toBe(false);
    expect(isImported({ ...finding, file: "/x/b.nix" }, "a.nix")).toBe(true);
    expect(isImported(finding, "a.nix")).toBe(false);
  });
});

describe("an option set in several places", () => {
  const set = (line: number, kind: Assignment["kind"], value?: string) =>
    ({
      path: ["networking", "hostName"],
      line,
      col: 3,
      kind,
      ...(value && { value }),
    }) as Assignment;
  const wrong = (printed: string) => ({
    ...finding,
    file: "a.nix",
    definitions: [{ file: "a.nix", value: printed }],
  });

  test("the place whose value is what Nix printed is the one", () => {
    const places = [set(2, "str", "box"), set(7, "int")];
    expect(fromFinding(wrong("5"), places, "a.nix")).toMatchObject({ line: 7 });
    expect(fromFinding(wrong("5"), places, "a.nix").alternatives).toBeUndefined();
  });

  test("two strings are told apart by their text", () => {
    const places = [set(2, "str", "box"), set(7, "str", "other")];
    expect(fromFinding(wrong('"other"'), places, "a.nix")).toMatchObject({ line: 7 });
  });

  test("when they cannot be told apart, the others are said, not hidden", () => {
    const places = [set(2, "int"), set(7, "int"), set(9, "int")];
    const placed = fromFinding(wrong("5"), places, "a.nix");
    expect(placed).toMatchObject({
      line: 2,
      alternatives: [
        { line: 7, col: 3 },
        { line: 9, col: 3 },
      ],
    });
  });

  test("a value that is not written out could be any definition", () => {
    const places = [set(2, "str", "box"), set(7, "other")];
    expect(fromFinding(wrong("5"), places, "a.nix")).toMatchObject({ line: 7 });
    // ...and with nothing Nix printed, every place stays a candidate.
    expect(fromFinding(finding, places, "a.nix").alternatives).toEqual([{ line: 7, col: 3 }]);
  });

  test("what Nix printed is read as the kind of value it is", () => {
    const places = [set(1, "bool"), set(2, "list"), set(3, "attrs"), set(4, "other")];
    const at = (printed: string) => fromFinding(wrong(printed), places, "a.nix").line;
    expect([at("true"), at("[ 1 ]"), at("{ a = 1; }"), at("<function>")]).toEqual([1, 2, 3, 4]);
  });
});

describe("what is said after the findings", () => {
  const said = (items: Located[], how: How) => {
    const lines: string[] = [];
    const log = console.log;
    console.log = (line: string) => void lines.push(line);
    try {
      printText(items, "1 of 1 checked.", how);
    } finally {
      console.log = log;
    }
    return lines.join("\n");
  };
  const confirmed: Located = {
    level: "evaluation",
    severity: "error",
    message: "bad",
    line: 1,
    col: 1,
  };

  test("the way Nix stops is told only for a whole system that failed", () => {
    expect(said([confirmed], "whole")).toContain("Nix stops at the first error");
    expect(said([], "whole")).not.toContain("Nix stops");
    expect(said([confirmed], "partial")).not.toContain("Nix stops");
    expect(said([confirmed], "static")).not.toContain("Nix stops");
  });

  test("a file not evaluated because of its syntax says so, and one checked statically does not", () => {
    expect(said([], "syntax")).toContain("Not evaluated");
    expect(said([], "static")).not.toContain("Not evaluated");
  });

  test("the counts and the coverage are always there", () => {
    expect(said([confirmed], "static")).toContain("1 errors, 0 warnings. 1 of 1 checked.");
  });
});
