import { describe, expect, test } from "bun:test";
import { enumElementKind } from "./pattern";
import { elementsOf, fromShape } from "./shape";

describe("fromShape", () => {
  test("single scalars and attribute sets", () => {
    expect(fromShape(["b"])).toEqual({ type: "bool" });
    expect(fromShape(["i"])).toEqual({ type: "int" });
    expect(fromShape(["s"])).toEqual({ type: "str" });
    // Whether a set is free-form is not part of its type.
    expect(fromShape(["a"])).toBeUndefined();
  });

  test("lists keep the kinds of their elements", () => {
    expect(fromShape([["l", "s"]])).toEqual({ type: "list", values: ["str"] });
    expect(fromShape([["l", "s", "i"]])).toEqual({ type: "list", values: ["str", "int"] });
    expect(fromShape([["l", "?"]])).toEqual({ type: "list" });
    expect(fromShape([["l", ["l", "s"]]])).toEqual({ type: "list", values: ["list"] });
  });

  test("paths", () => {
    expect(fromShape(["p"])).toEqual({ type: "path" });
    expect(fromShape(["p", "i"])).toEqual({ type: "mix", values: ["path", "int"] });
    // As list elements they are paths too.
    expect(fromShape([["l", "p"]])).toEqual({ type: "list", values: ["path"] });
  });

  test("strings with a pattern keep it, apart from the `+` and `:` that separate kinds", () => {
    const kind = "re:%5Ba-z%5D%2B%3A";
    expect(fromShape([["r", "[a-z]+:"]])).toEqual({ type: "mix", values: [kind] });
    expect(fromShape(["i", ["r", "x"]])).toEqual({ type: "mix", values: ["int", "re:x"] });
    expect(fromShape([["l", ["r", "[a-z]+:"]]])).toEqual({ type: "list", values: [kind] });
    expect(fromShape([["l", ["r", "x"], "i"]])).toEqual({ type: "list", values: ["re:x", "int"] });
  });

  test("enums", () => {
    expect(fromShape([["e", "a", "b"]])).toEqual({ type: "enum", values: ["a", "b"] });
  });

  test("alternatives keep what each one is made of", () => {
    expect(fromShape(["s", ["l", "s"]])).toEqual({ type: "mix", values: ["str", "list:str"] });
    expect(fromShape(["i", ["e", "auto"]])).toEqual({
      type: "mix",
      values: ["int", 'enum:["auto"]'],
    });
    expect(
      fromShape([
        ["l", "s"],
        ["l", "i"],
      ]),
    ).toEqual({
      type: "mix",
      values: ["list:str", "list:int"],
    });
    expect(fromShape(["a", ["l", ["l", "s"]]])).toEqual({ type: "mix", values: ["attrs", "list"] });
    expect(fromShape(["s", ["e", "x"]])).toEqual({ type: "mix", values: ["str", 'enum:["x"]'] });
    expect(
      fromShape([
        ["l", "s"],
        ["l", "i"],
        ["l", "b"],
      ])?.values,
    ).toHaveLength(3);
    expect(fromShape([["l", ["e", "x"]], "s"])).toEqual({
      type: "mix",
      values: ["list:enum:%5B%22x%22%5D", "str"],
    });
  });

  test("a list of an enum keeps its values, whatever characters they have", () => {
    expect(fromShape([["l", ["e", "a+b", "c:d"]]])).toEqual({
      type: "list",
      values: [enumElementKind(["a+b", "c:d"])],
    });
  });

  test("one alternative nothing can be said about leaves everything unchecked", () => {
    expect(fromShape(["s", "?"])).toEqual({ type: "any" });
    expect(fromShape(["b", "i", "?", "s", "a"])).toEqual({ type: "any" });
    // Alone, it is for the manuals to describe.
    expect(fromShape(["?"])).toBeUndefined();
  });

  test("reads the values of an attribute set of something", () => {
    expect(elementsOf([["m", "s", "i"]])).toEqual(["str", "int"]);
    expect(elementsOf([["m", ["l", "s"], ["e", "a"], ["m", "s"]]])).toEqual([
      "list:str",
      'enum:["a"]',
      "attrs",
    ]);
    expect(elementsOf([["m", "?"]])).toBeUndefined();
    expect(elementsOf(["s"])).toBeUndefined();
    expect(elementsOf(["s", ["m", "s"]])).toBeUndefined();
    // As a list element, or on its own, it is an attribute set.
    expect(fromShape([["l", ["m", "s"]]])).toEqual({ type: "list", values: ["attrs"] });
    expect(fromShape([["m", "s"]])).toBeUndefined();
    expect(fromShape(["s", ["m", "s"]])).toEqual({ type: "mix", values: ["str", "attrs"] });
  });

  test("a float adds nothing, as no float is ever read as a value", () => {
    expect(fromShape(["i", "f"])).toEqual({ type: "int" });
    expect(fromShape(["f"])).toBeUndefined();
    expect(fromShape([["l", "f", "s"]])).toEqual({ type: "list", values: ["str"] });
    expect(fromShape([["l", "f"]])).toEqual({ type: "list" });
    expect(elementsOf([["m", "s", "f"]])).toEqual(["str"]);
    expect(elementsOf([["m", "f"]])).toBeUndefined();
  });
});

describe("a package", () => {
  test("is a kind a value can be: an option of one is a mix with it, a list of them a list of it", () => {
    expect(fromShape(["k"])).toEqual({ type: "mix", values: ["pkg"] });
    expect(fromShape([["l", "k"]])).toEqual({ type: "list", values: ["pkg"] });
    expect(fromShape(["k", "s"])).toEqual({ type: "mix", values: ["pkg", "str"] });
    expect(elementsOf([["m", "k"]])).toEqual(["pkg"]);
  });
});
