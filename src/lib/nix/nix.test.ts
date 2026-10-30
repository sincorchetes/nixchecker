import { describe, expect, test } from "bun:test";
import { checkBalance } from "./balance";
import { scan } from "./scan";
import { tokenize } from "./tokenize";

const paths = (src: string) => scan(tokenize(src).tokens).map((a) => a.path.join("."));
const first = (src: string) => scan(tokenize(src).tokens)[0];

describe("tokenize", () => {
  test("skips comments and whitespace", () => {
    const { tokens, errors } = tokenize("# line\n/* block\n */ a = 1;");
    expect(tokens.map((t) => t.text)).toEqual(["a", "=", "1", ";"]);
    expect(tokens[0]).toMatchObject({ line: 3, col: 5 });
    expect(errors).toEqual([]);
  });

  test("reads plain, escaped and interpolated strings", () => {
    const { tokens } = tokenize('"a\\"b" "x${"}"}y"');
    expect(tokens[0]).toMatchObject({ kind: "string", text: 'a\\"b', interpolated: false });
    expect(tokens[1]).toMatchObject({ kind: "string", interpolated: true });
  });

  test("reads indented strings with escapes and interpolation", () => {
    const { tokens } = tokenize("''a '''b ''$c ''\\n ${x} d'' next");
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toMatchObject({ kind: "string", interpolated: true });
    expect(tokens[1]?.text).toBe("next");
  });

  test("tells identifiers, numbers and punctuation apart", () => {
    const { tokens } = tokenize("foo-bar 1.5 7 ;");
    expect(tokens.map((t) => t.kind)).toEqual(["ident", "number", "number", "punct"]);
  });

  test("reports unterminated strings and comments", () => {
    expect(tokenize('a = "oops').errors[0]?.code).toBe("syntax-unterminated-string");
    expect(tokenize("a = ''oops").errors[0]?.code).toBe("syntax-unterminated-string");
    expect(tokenize("a /* oops").errors[0]).toMatchObject({
      code: "syntax-unterminated-comment",
      line: 1,
      col: 3,
    });
  });
});

describe("checkBalance", () => {
  test("accepts balanced brackets", () => {
    expect(checkBalance(tokenize("{ a = [ (1) ]; }").tokens)).toEqual([]);
  });

  test("reports stray and unclosed brackets", () => {
    expect(checkBalance(tokenize("a }").tokens)).toEqual([{ char: "}", line: 1, col: 3 }]);
    expect(checkBalance(tokenize("{ a = [ }").tokens).map((e) => e.char)).toEqual(["}", "{"]);
    expect(checkBalance(tokenize("{ a").tokens)).toEqual([{ char: "{", line: 1, col: 1 }]);
  });
});

describe("scan", () => {
  test("collects dotted and nested paths", () => {
    expect(paths("{ a.b = 1; c = { d = 2; e.f = 3; }; }")).toEqual(["a.b", "c", "c.d", "c.e.f"]);
  });

  test("skips function patterns, let blocks and inherit", () => {
    const src = "{ config, ... }: let x = { y = 1; }; in { inherit x; a = 1; }";
    expect(paths(src)).toEqual(["a"]);
  });

  test("handles nested let and braces in default values", () => {
    expect(paths("{ a ? {}, ... }: let b = let c = 1; in c; in { z = b; }")).toEqual(["z"]);
  });

  test("keeps function bodies and mkIf sets opaque", () => {
    expect(paths("{ a = lib.mkIf x { b = 1; }; f = { y }: { g = 1; }; c = {} // d; }")).toEqual([
      "a",
      "f",
      "c",
    ]);
  });

  test("treats quoted and interpolated segments as wildcards-by-name", () => {
    expect(paths('{ a."b.c".d = 1; a.${x}.e = 2; }')).toEqual(["a.b.c.d", "a.*.e"]);
  });

  test("classifies scalar values", () => {
    const kinds = scan(
      tokenize('{ a = true; b = "s"; c = 3; d = [ 1 ]; e = 1.5; f = "x${y}"; g = true && x; }')
        .tokens,
    ).map((a) => a.kind);
    expect(kinds).toEqual(["bool", "str", "int", "list", "other", "str", "bool"]);
    expect(first('{ a = "s"; }')?.value).toBe("s");
  });

  test("recovers from malformed statements", () => {
    expect(paths("{ ; = ; a = 1; b ) c; d = 2 }")).toEqual(["a", "d"]);
  });

  test("returns nothing without a root set", () => {
    expect(paths("1 + 2")).toEqual([]);
    expect(paths("{ a = 1;")).toEqual(["a"]);
  });
});

describe("scan problems", () => {
  const problems = (src: string) => {
    const found: [string, string, number][] = [];
    scan(tokenize(src).tokens, (p) => found.push([p.kind, p.path.join("."), p.col]));
    return found;
  };

  test("reports assignments with no `=` and with no `;`", () => {
    expect(problems("{ a.b }")).toEqual([["incomplete", "a.b", 3]]);
    expect(problems("{ a.b = 1 }")).toEqual([["unterminated", "a.b", 3]]);
    expect(problems("{ a.b = 1; }")).toEqual([]);
  });

  test("treats a statement cut off by the end of the input as unterminated", () => {
    expect(problems("{ a.b = 1")).toEqual([["unterminated", "a.b", 3]]);
  });
});

describe("scan: a `;` lost in the middle of a set", () => {
  const found = (src: string) => {
    const problems: string[] = [];
    const paths = scan(tokenize(src).tokens, (p) => problems.push(`${p.kind}:${p.path.join(".")}`));
    return { problems, paths: paths.map((a) => a.path.join(".")) };
  };

  test("reports it and keeps scanning the next assignment", () => {
    expect(found("{\n  a.b = 1\n  c.d = 2;\n}")).toEqual({
      problems: ["unterminated:a.b"],
      paths: ["a.b", "c.d"],
    });
    expect(found('{\n  a = "x"\n  "q.r".s = 2;\n}').problems).toEqual(["unterminated:a"]);
  });

  test("does not mistake multi-line values, comparisons or let bindings for new statements", () => {
    expect(found("{\n  a = foo\n    bar;\n  b = 1;\n}").problems).toEqual([]);
    expect(found("{\n  a = let\n    x = 1;\n  in x;\n}").problems).toEqual([]);
    expect(found("{\n  a = if b\n    == c then 1 else 2;\n}").problems).toEqual([]);
    expect(found("{\n  a = [\n    1\n  ];\n  b = 2;\n}").problems).toEqual([]);
  });
});

describe("scan: kinds of simple expressions", () => {
  const kind = (value: string) => scan(tokenize(`{ a = ${value}; }`).tokens)[0]?.kind;

  test("looks through mkDefault, mkForce and mkOverride", () => {
    expect(kind("lib.mkDefault true")).toBe("bool");
    expect(kind("mkForce [ 1 ]")).toBe("list");
    expect(kind("lib.mkOverride 50 5")).toBe("int");
    expect(kind('lib.mkDefault "x"')).toBe("str");
    expect(kind("lib.mkDefault { x = 1; }")).toBe("other");
  });

  test("knows what always yields a boolean", () => {
    expect(kind("!config.x.enable")).toBe("bool");
    expect(kind("a && b")).toBe("bool");
    expect(kind("a || (b && c)")).toBe("bool");
    expect(kind("x == y")).toBe("bool");
    expect(kind("x != y")).toBe("bool");
  });

  test("does not guess when something could hide the type", () => {
    expect(kind("if c then a == b else 1")).toBe("other");
    expect(kind("let x = 1; in x == 1")).toBe("other");
    expect(kind("x: x == 1")).toBe("other");
    expect(kind("f (a == b)")).toBe("other");
    expect(kind("a & b")).toBe("other");
    expect(kind("[ (a == b) ]")).toBe("list");
  });

  test("an interpolated string is a string", () => {
    expect(kind('"x-${y}"')).toBe("str");
    expect(kind('"x-${y}" + z')).toBe("other");
  });
});
