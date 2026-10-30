import { describe, expect, test } from "bun:test";
import { findMistakes } from "./mistakes";
import { parse } from "./parse";

const mistakes = (src: string) => {
  const { ast } = parse(src);
  if (!ast) throw new Error("no tree");
  return findMistakes(ast).map((m) => [m.name, m.code.replace("not-callable-", ""), m.line, m.col]);
};

describe("calls that cannot work", () => {
  test("a name bound to a list, string or number cannot be called", () => {
    expect(mistakes("let xs = [ 1 ]; in { a = xs [ 2 ]; }")).toEqual([["xs", "list", 1, 26]]);
    expect(mistakes('let s = "x"; in s 1')).toEqual([["s", "string", 1, 17]]);
    expect(mistakes("let n = 1; in { a = n 2; }")).toEqual([["n", "number", 1, 21]]);
    expect(mistakes("rec { xs = [ ]; a = xs 1; }")).toEqual([["xs", "list", 1, 21]]);
    expect(mistakes("let xs = [ ]; ys = xs; in ys 1")).toEqual([["ys", "list", 1, 27]]);
    expect(mistakes("let xs = [ ]; ys = (xs); in ys 1")).toEqual([["ys", "list", 1, 29]]);
  });

  test("so is a literal", () => {
    expect(mistakes("[ 1 ] [ 2 ]")).toEqual([["[ … ]", "list", 1, 1]]);
    expect(mistakes('"x" y')).toEqual([['"…"', "string", 1, 1]]);
    expect(mistakes("1 y")).toEqual([["…", "number", 1, 1]]);
    expect(mistakes('("x") y')).toEqual([['"…"', "string", 1, 1]]);
  });

  test("it looks everywhere, with the scope of each place", () => {
    const src = `{
      a = let xs = [ ]; in f (g xs) { b = [ (xs 1) ]; };
      c = if p then x: x y else (with q; z) w;
      d = !(xs 1) && e ? f.g or (xs 2);
      inherit (h xs) i;
      k.\${"l"} = assert m; -n;
    }`;
    // `xs` is only a list inside the first `let`: the later calls to it are not flagged.
    expect(mistakes(src)).toEqual([["xs", "list", 2, 46]]);
  });

  test("only calls that are certain to fail are reported", () => {
    expect(mistakes("let xs = [ ]; in xs")).toEqual([]);
    expect(mistakes("let f = x: x; in f 1")).toEqual([]);
    expect(mistakes("let xs = [ ]; in x: xs 1")).toEqual([["xs", "list", 1, 21]]);
    expect(mistakes("let xs = [ ]; in xs: xs 1")).toEqual([]);
    expect(mistakes("{ xs = [ ]; a = xs 1; }")).toEqual([]);
    expect(mistakes("let xs = [ ]; in { inherit xs; a = xs 1; }")).toEqual([["xs", "list", 1, 36]]);
    expect(mistakes("let xs.y = [ ]; in xs 1")).toEqual([]);
    expect(mistakes("let s = { __functor = self: x: x; }; in s 1")).toEqual([]);
    expect(mistakes("f g h")).toEqual([]);
    expect(mistakes("let a = a; in a 1")).toEqual([]);
  });
});

describe("operators that cannot work", () => {
  test("`+` does not join lists", () => {
    expect(mistakes("let common = [ ]; in common + [ 1 ]")).toEqual([
      ["common", "list-plus", 1, 22],
      ["[ … ]", "list-plus", 1, 31],
    ]);
    expect(mistakes("[ 1 ] + x")).toEqual([["[ … ]", "list-plus", 1, 1]]);
    expect(mistakes('"a" + "b" + 1')).toEqual([]);
    expect(mistakes("let xs = [ ]; in xs: xs + 1")).toEqual([]);
  });

  test("`++` only joins lists", () => {
    expect(mistakes('"a" ++ [ 1 ]')).toEqual([['"…"', "concat-non-list", 1, 1]]);
    expect(mistakes("let n = 1; in [ ] ++ n")).toEqual([["n", "concat-non-list", 1, 22]]);
    expect(mistakes("[ 1 ] ++ [ 2 ] ++ x")).toEqual([]);
    expect(mistakes("a ++ b")).toEqual([]);
  });
});
