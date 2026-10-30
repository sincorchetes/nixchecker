import { describe, expect, test } from "bun:test";
import { parse } from "./parse";
import { scan } from "./scan";

const problems = (src: string) =>
  parse(src).problems.map((p) => [p.code, p.line, p.col, p.params] as const);
const codes = (src: string) => parse(src).problems.map((p) => p.code);

const scanned = (src: string) => {
  const { ast } = parse(src);
  if (!ast) throw new Error("no tree");
  return scan(ast);
};

describe("parse: valid code", () => {
  test("accepts the shapes of real Nix", () => {
    const valid = [
      "{ pkgs, lib ? 1, ... }@args: { a = pkgs.hello; }",
      "args@{ a, b }: a",
      "x: y: x + y * 2 - 1",
      "let a = 1; b = a; inherit (c) d e; in { inherit a b; }",
      "with import <nixpkgs> {}; [ hello world ]",
      "assert a == b; if a then 1 else 2",
      '{ a.b."c d".${e} = f g (h i); rec-x = rec { y = 1; z = y; }; }',
      "a.b or c // { d = !e && f || g -> h; }",
      "a ? b.c && (x: x) 1",
      "-1 + (-a) * b / c ++ d",
      '{ a = x: x; b = { c }: c; d = [ (x: x) "s" ./p ]; }',
      "builtins.map (x: x) [ 1 2 3 ]",
      "''multi ${x} line'' + \"\"",
    ];
    for (const src of valid) expect(problems(src), src).toEqual([]);
  });

  test("an empty file has nothing to report", () => {
    expect(parse("  # just a comment\n")).toEqual({ problems: [], lexical: false });
  });
});

describe("parse: problems", () => {
  test("a missing `;` is reported where it should go, and parsing goes on", () => {
    const src = "{\n  a = 1\n  b = 2;\n  inherit x\n  c = 3;\n}";
    expect(problems(src)).toEqual([
      ["syntax-unterminated", 2, 8, { path: "a" }],
      ["syntax-unterminated", 4, 12, { path: "inherit" }],
    ]);
    expect(scanned(src).assignments.map((a) => a.path[0])).toEqual(["a", "b", "c"]);
  });

  test("`;` is only assumed when something that can follow is there", () => {
    expect(problems("{ a = 1 )")).toEqual([
      ["syntax-expected", 1, 9, { expected: ";", found: ")" }],
      ["syntax-unbalanced", 1, 9, { char: ")" }],
    ]);
    expect(problems("{ a = 1")).toEqual([["syntax-unclosed", 1, 1, { char: "{" }]]);
  });

  test("assignments without `=`, and paths cut off by a dot", () => {
    expect(problems("{ services.openssl }")).toEqual([
      ["syntax-incomplete", 1, 3, { path: "services.openssl" }],
    ]);
    expect(problems("{\n  a = 1;\n  gnome.\n}")).toEqual([
      ["syntax-incomplete", 3, 3, { path: "gnome" }],
    ]);
    expect(problems("{ a b = 1; }")).toEqual([
      ["syntax-expected", 1, 5, { expected: "=", found: "b" }],
    ]);
  });

  test("brackets that do not match", () => {
    expect(problems("{ a = [ 1; }")).toEqual([["syntax-unexpected", 1, 10, { found: ";" }]]);
    expect(problems("{ a = (1; }")[0]?.[0]).toBe("syntax-expected");
    expect(problems("{ a = 1; } }")).toEqual([["syntax-unbalanced", 1, 12, { char: "}" }]]);
    expect(problems("( 1")).toEqual([["syntax-unclosed", 1, 1, { char: "(" }]]);
    expect(problems("[ 1")).toEqual([["syntax-unclosed", 1, 1, { char: "[" }]]);
    expect(problems("{ a }: { b = 1;")).toEqual([["syntax-unclosed", 1, 8, { char: "{" }]]);
  });

  test("keywords and expressions in the wrong place", () => {
    expect(problems("if a 1 else 2")).toEqual([
      ["syntax-expected", 1, 8, { expected: "then", found: "else" }],
    ]);
    expect(problems("let a = 1;")).toEqual([["syntax-expected-eof", 1, 11, { expected: "in" }]]);
    expect(problems("a b )")).toEqual([["syntax-unbalanced", 1, 5, { char: ")" }]]);
    expect(problems("a = ")).toEqual([["syntax-unexpected", 1, 3, { found: "=" }]]);
    expect(problems("{ a = then; }")[0]?.[0]).toBe("syntax-unexpected");
    expect(problems("with a")).toEqual([["syntax-expected-eof", 1, 7, { expected: ";" }]]);
    expect(codes("{ a = ; }")).toEqual(["syntax-unexpected"]);
    expect(codes("x:")).toEqual(["syntax-unexpected-eof"]);
  });

  test("function arguments", () => {
    expect(codes("{ a, b c }: 1")).toEqual(["syntax-expected"]);
    expect(codes("{ a, 1 }: 1")).toEqual(["syntax-unexpected"]);
    expect(codes("{ a @ x }: 1")).toEqual(["syntax-expected"]);
    expect(codes("{ a }@: 1")).toEqual(["syntax-unexpected"]);
    expect(codes("{ a ")).toEqual(["syntax-unclosed"]);
    expect(codes("a@x")).toEqual(["syntax-expected"]);
  });

  test("a recovered binding is left out, the rest is kept", () => {
    const src = "{ a = 1; b = = 2; c = 3; d = [ 1 2; e = 4; }";
    const result = parse(src);
    expect(result.problems.length).toBeGreaterThan(1);
    expect(scanned(src).assignments.map((a) => a.path[0])).toContain("c");
  });

  test("skips a broken binding, brackets included, and reads the next", () => {
    const src = "{ a b = [ 1 (2) ]; c = 3; }";
    expect(codes(src)).toEqual(["syntax-expected"]);
    expect(scanned(src).assignments.map((a) => a.path[0])).toEqual(["c"]);
  });

  test("an open string or comment is the only thing reported", () => {
    const result = parse('{ a = "x; b = (; }');
    expect(result.lexical).toBe(true);
    expect(result.problems.map((p) => p.code)).toEqual(["syntax-unterminated-string"]);
  });

  test("parses what is inside the interpolations of strings", () => {
    expect(codes('{ a = "x ${b.c} y"; }')).toEqual([]);
    expect(codes("{ a = ''$${a b}''; }")).toEqual([]);
    expect(codes('{ a = "$${a b}"; }')).toEqual([]);
    expect(problems('{ a = "x ${b..c}"; }')[0]?.slice(1, 3)).toEqual([1, 14]);
    expect(codes("{ a = ''\n  ${ foo ) }\n''; }")).toEqual(["syntax-unbalanced"]);
    expect(problems("{ a = ''\n  x\n  ${ y\n   ) }''; }")[0]?.slice(1, 3)).toEqual([4, 4]);
    expect(codes('{ a = "${ "${b@}" }"; }')).not.toEqual([]);
  });

  test("an empty interpolation is reported", () => {
    expect(problems('{ a = "${}"; }')[0]).toEqual(["syntax-unexpected", 1, 10, { found: "}" }]);
  });

  test("keywords and indented strings are not attribute names", () => {
    expect(codes("a.in")).toEqual(["syntax-unexpected"]);
    expect(codes("a ? in")).toEqual(["syntax-unexpected"]);
    expect(codes("{ if = 1; }")).toEqual(["syntax-unexpected"]);
    expect(codes("{ a.if = 1; }")).toEqual(["syntax-incomplete"]);
    expect(codes("a.''b''")).toEqual(["syntax-unexpected"]);
    expect(codes('a."b"')).toEqual([]);
  });
});
