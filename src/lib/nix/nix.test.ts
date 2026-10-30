import { describe, expect, test } from "bun:test";
import { findBadCalls } from "./calls";
import { lex } from "./lex";
import { parse } from "./parse";
import { scan } from "./scan";

const kinds = (src: string) => lex(src).tokens.map((t) => `${t.kind}:${t.text}`);
const problems = (src: string) =>
  parse(src).problems.map((p) => [p.code, p.line, p.col, p.params] as const);
const codes = (src: string) => parse(src).problems.map((p) => p.code);
const scanned = (src: string) => {
  const { ast } = parse(src);
  if (!ast) throw new Error("no tree");
  return scan(ast);
};
const kindOf = (value: string) => scanned(`{ a = ${value}; }`).assignments[0]?.kind;

describe("lex", () => {
  test("splits identifiers, numbers, strings and operators, tracking positions", () => {
    expect(kinds('a-b = 1.5 + "x"; # note\n c = [ ] ++ x;')).toEqual([
      "ident:a-b",
      "punct:=",
      "number:1.5",
      "punct:+",
      "string:x",
      "punct:;",
      "ident:c",
      "punct:=",
      "punct:[",
      "punct:]",
      "punct:++",
      "ident:x",
      "punct:;",
    ]);
    const [, second] = lex("a\n  bc").tokens;
    expect(second).toMatchObject({ line: 2, col: 3, endLine: 2, endCol: 5 });
  });

  test("reads paths, search paths, URIs and paths with interpolation", () => {
    expect(kinds("./a/b.nix <nixpkgs> ~/x a / b")).toEqual([
      "path:./a/b.nix",
      "path:<nixpkgs>",
      "path:~/x",
      "ident:a",
      "punct:/",
      "ident:b",
    ]);
    expect(kinds("https://example.org/x")).toEqual(["path:https://example.org/x"]);
    expect(kinds("./patches/${v}/x.patch ./${n}.cert")).toEqual([
      "path:./patches/${…}/x.patch",
      "path:./${…}.cert",
    ]);
  });

  test("keeps the value of plain strings only, with escapes undone", () => {
    const [plain, interpolated, indented] = lex(`"a\\"b\\n" "x\${y}" ''z''`).tokens;
    expect(plain?.value).toBe('a"b\n');
    expect(interpolated?.value).toBeUndefined();
    expect(indented?.value).toBe("z");
  });

  test("copes with nested strings, comments and escapes inside interpolations", () => {
    const src = `''
      \${f "a" ''b''} \${
        # a " in a comment
        x /* and " here */ }
      ''\\'' ''$\{ '''
    ''`;
    expect(lex(src).errors).toEqual([]);
    expect(lex(src).tokens).toHaveLength(1);
  });

  test("reports what is left open", () => {
    expect(lex('a = "x;').errors).toMatchObject([{ code: "syntax-unterminated-string" }]);
    expect(lex("a = ''x").errors).toMatchObject([{ code: "syntax-unterminated-string" }]);
    expect(lex("a /* x").errors).toMatchObject([{ code: "syntax-unterminated-comment", col: 3 }]);
    expect(kinds("a /* b */ c")).toEqual(["ident:a", "ident:c"]);
  });
});

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
});

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

describe("findBadCalls", () => {
  const bad = (src: string) => {
    const { ast } = parse(src);
    if (!ast) throw new Error("no tree");
    return findBadCalls(ast).map((c) => [c.name, c.kind, c.line, c.col]);
  };

  test("a name bound to a list, string or number cannot be called", () => {
    expect(bad("let xs = [ 1 ]; in { a = xs [ 2 ]; }")).toEqual([["xs", "list", 1, 26]]);
    expect(bad('let s = "x"; in s 1')).toEqual([["s", "string", 1, 17]]);
    expect(bad("let n = 1; in { a = n 2; }")).toEqual([["n", "number", 1, 21]]);
    expect(bad("rec { xs = [ ]; a = xs 1; }")).toEqual([["xs", "list", 1, 21]]);
    expect(bad("let xs = [ ]; ys = xs; in ys 1")).toEqual([["ys", "list", 1, 27]]);
    expect(bad("let xs = [ ]; ys = (xs); in ys 1")).toEqual([["ys", "list", 1, 29]]);
  });

  test("so is a literal", () => {
    expect(bad("[ 1 ] [ 2 ]")).toEqual([["[ … ]", "list", 1, 1]]);
    expect(bad('"x" y')).toEqual([['"…"', "string", 1, 1]]);
    expect(bad("1 y")).toEqual([["…", "number", 1, 1]]);
    expect(bad('("x") y')).toEqual([['"…"', "string", 1, 1]]);
  });

  test("it looks everywhere, with the scope of each place", () => {
    const src = `{
      a = let xs = [ ]; in f (g xs) { b = [ (xs 1) ]; };
      c = if p then x: x y else (with q; z) w;
      d = !(xs 1) && e ? f.g or (xs 2);
      inherit (h xs) i;
      k.${"l"} = assert m; -n;
    }`;
    // `xs` is only a list inside the first `let`: the later calls to it are not flagged.
    expect(bad(src)).toEqual([["xs", "list", 2, 46]]);
  });

  test("only calls that are certain to fail are reported", () => {
    expect(bad("let xs = [ ]; in xs")).toEqual([]);
    expect(bad("let f = x: x; in f 1")).toEqual([]);
    expect(bad("let xs = [ ]; in x: xs 1")).toEqual([["xs", "list", 1, 21]]);
    expect(bad("let xs = [ ]; in xs: xs 1")).toEqual([]);
    expect(bad("{ xs = [ ]; a = xs 1; }")).toEqual([]);
    expect(bad("let xs = [ ]; in { inherit xs; a = xs 1; }")).toEqual([["xs", "list", 1, 36]]);
    expect(bad("let xs.y = [ ]; in xs 1")).toEqual([]);
    expect(bad("let s = { __functor = self: x: x; }; in s 1")).toEqual([]);
    expect(bad("f g h")).toEqual([]);
    expect(bad("let a = a; in a 1")).toEqual([]);
  });
});
