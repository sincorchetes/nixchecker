import { describe, expect, test } from "bun:test";
import { fromShape } from "./shape";

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
      values: ["list:str", "str"],
    });
  });

  test("one alternative nothing can be said about leaves everything unchecked", () => {
    expect(fromShape(["s", "?"])).toEqual({ type: "any" });
    expect(fromShape(["b", "i", "?", "s", "a"])).toEqual({ type: "any" });
    // Alone, it is for the manuals to describe.
    expect(fromShape(["?"])).toBeUndefined();
  });
});
