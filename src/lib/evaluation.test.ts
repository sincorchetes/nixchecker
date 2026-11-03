import { describe, expect, test } from "bun:test";
import { parseEvaluation } from "./evaluation";

describe("parseEvaluation", () => {
  test("a missing option", () => {
    const out =
      "error:\n       error: The option `networking.hostname' does not exist. Definition values:\n       - In `f.nix': \"x\"\n";
    expect(parseEvaluation(out)).toEqual([
      {
        kind: "unknown-option",
        option: "networking.hostname",
        file: "f.nix",
        message: "The option networking.hostname does not exist",
      },
    ]);
  });

  test("several missing options", () => {
    const out = "error: The options `a.b', `c.d' do not exist. Definition values:";
    expect(parseEvaluation(out).map((f) => f.option)).toEqual(["a.b", "c.d"]);
  });

  test("several missing options do not share one file", () => {
    const out = "error: The options `a', `b' do not exist. Definition values:\n- In `f.nix': 1";
    expect(parseEvaluation(out).some((f) => f.file)).toBe(false);
  });

  test("a value of the wrong type", () => {
    const out =
      "evaluation warning: x is old\nerror:\n   … while evaluating the option `a':\n   error: A definition for option `networking.hostName' is not of type `string matching the pattern ^$|^[a-z]'. Definition values:\n   - In `f.nix': 5";
    expect(parseEvaluation(out)).toEqual([
      { kind: "warning", message: "x is old" },
      {
        kind: "type-error",
        option: "networking.hostName",
        expected: "string matching the pattern ^$|^[a-z]",
        file: "f.nix",
        message:
          "A definition for networking.hostName is not of type string matching the pattern ^$|^[a-z]",
      },
    ]);
  });

  test("failed assertions, with messages over several lines", () => {
    const out =
      "error:\n   Failed assertions:\n   - First thing\n     goes on here.\n   - Second thing\n";
    expect(parseEvaluation(out).map((f) => [f.kind, f.message])).toEqual([
      ["assertion", "First thing goes on here."],
      ["assertion", "Second thing"],
    ]);
  });

  test("any other error keeps its first line; no error leaves only the warnings", () => {
    expect(parseEvaluation("error: something broke\n  more detail")).toEqual([
      { kind: "error", message: "something broke" },
    ]);
    expect(parseEvaluation("evaluation warning: careful")).toEqual([
      { kind: "warning", message: "careful" },
    ]);
    expect(parseEvaluation("")).toEqual([]);
  });
});
