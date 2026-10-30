import { describe, expect, test } from "bun:test";
import { parse } from "./parse";
import { scan } from "./scan";

const scanned = (src: string) => {
  const { ast } = parse(src);
  if (!ast) throw new Error("no tree");
  return scan(ast);
};
const kindOf = (value: string) => scanned(`{ a = ${value}; }`).assignments[0]?.kind;

describe("scan", () => {
  test("finds the root set through functions, let, with, assert and parentheses", () => {
    const src =
      "{ pkgs }: let x = 1; in with pkgs; assert x == 1; ({ a.b = 1; c = { d = true; }; })";
    expect(scanned(src).assignments).toEqual([
      { path: ["a", "b"], kind: "int", line: 1, col: 54 },
      { path: ["c"], kind: "attrs", line: 1, col: 63 },
      { path: ["c", "d"], kind: "bool", line: 1, col: 69 },
    ]);
    expect(scanned("f { a = 1; }").assignments).toEqual([]);
    expect(scanned("[ ]").assignments).toEqual([]);
  });

  test("keeps `rec` sets, `mkIf` and lists opaque, and skips inherit", () => {
    const { assignments } = scanned(
      "{ inherit a; r = rec { x = 1; }; m = lib.mkIf c { y = 1; }; l = [ { z = 1; } ]; }",
    );
    expect(assignments.map((a) => [a.path.join("."), a.kind])).toEqual([
      ["r", "other"],
      ["m", "other"],
      ["l", "list"],
    ]);
  });

  test("names a computed attribute as a wildcard", () => {
    const { assignments } = scanned('{ a.${n}.b = 1; "x.y".z = 2; "p${q}" = 3; }');
    expect(assignments.map((a) => a.path)).toEqual([["a", "*", "b"], ["x.y", "z"], ["*"]]);
  });

  test("looks through mkDefault, mkForce, mkOverride and mkIf", () => {
    expect(kindOf("lib.mkDefault true")).toBe("bool");
    expect(kindOf("mkForce [ 1 ]")).toBe("list");
    expect(kindOf("lib.mkOverride 50 5")).toBe("int");
    expect(kindOf('lib.mkIf c "x"')).toBe("str");
    expect(kindOf("lib.mkDefault { x = 1; }")).toBe("other");
    expect(kindOf("lib.mkMerge [ ]")).toBe("other");
    expect(kindOf("lib.other.mkDefault true")).toBe("other");
  });

  test("knows the kind of simple expressions", () => {
    expect(kindOf('"s"')).toBe("str");
    expect(kindOf('"x-${y}"')).toBe("str");
    expect(kindOf("3")).toBe("int");
    expect(kindOf("1.5")).toBe("other");
    expect(kindOf("!x")).toBe("bool");
    expect(kindOf("-x")).toBe("other");
    expect(kindOf("a && b")).toBe("bool");
    expect(kindOf("x == y")).toBe("bool");
    expect(kindOf("a ++ b")).toBe("list");
    expect(kindOf("a + b")).toBe("other");
    expect(kindOf("(true)")).toBe("bool");
    expect(kindOf("if c then 1 else 2")).toBe("other");
  });

  test("a string's value is kept only when it is plain", () => {
    expect(scanned('{ a = "x"; b = "${y}"; }').assignments.map((a) => a.value)).toEqual([
      "x",
      undefined,
    ]);
  });

  test("reports a lone name nothing defines, honoring scopes", () => {
    const undefinedIn = (src: string) => scanned(src).undefinedNames.map((n) => n.name);
    expect(undefinedIn("{ pkgs }:\n{\nservices.openssh = ena;\n}")).toEqual(["ena"]);
    expect(scanned("{ pkgs }: { a = ena; }").undefinedNames).toEqual([
      { name: "ena", line: 1, col: 17 },
    ]);
    expect(undefinedIn("{ x, y ? 1 }@args: { a = x; b = y; c = args; }")).toEqual([]);
    expect(undefinedIn("a: { b = a; }")).toEqual([]);
    expect(undefinedIn("let n = 1; inherit (q) m; in { a = n; b = m; }")).toEqual([]);
    expect(undefinedIn("rec { x = 1; a = x; }")).toEqual([]);
    expect(undefinedIn("{ x = 1; a = x; }")).toEqual(["x"]);
    expect(undefinedIn("with lib; { a = whatever; }")).toEqual([]);
    expect(undefinedIn("{ a = null; b = builtins; c = true; }")).toEqual([]);
    expect(undefinedIn("{ a = lib.mkDefault ena; }")).toEqual(["ena"]);
  });
});
