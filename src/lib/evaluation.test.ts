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
        definitions: [{ file: "f.nix", value: '"x"' }],
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
        definitions: [{ file: "f.nix", value: "5" }],
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

// Lines as `nix-instantiate --log-format internal-json` prints them (shortened).
const line = (entry: Record<string, unknown>) => `@nix ${JSON.stringify(entry)}`;
const ESC = String.fromCharCode(27);
const error = (raw: string) =>
  line({
    action: "msg",
    level: 0,
    msg: `${ESC}[31;1merror:${ESC}[0m trace and ${raw}`,
    raw_msg: raw,
  });

describe("parseEvaluation of Nix's own data", () => {
  test("a wrong type, with where each definition is and what it was set to", () => {
    const out = [
      line({ action: "start", id: 1, level: 5, text: "hashing", type: 0 }),
      error(
        "A definition for option `networking.hostName' is not of type `string'. Definition values:\n- In `/a/x.nix': 5\n- In `/a/y.nix': 6",
      ),
      line({ action: "stop", id: 1 }),
    ].join("\n");
    expect(parseEvaluation(out)).toEqual([
      {
        kind: "type-error",
        option: "networking.hostName",
        expected: "string",
        file: "/a/x.nix",
        definitions: [
          { file: "/a/x.nix", value: "5" },
          { file: "/a/y.nix", value: "6" },
        ],
        message: "A definition for networking.hostName is not of type string",
      },
    ]);
  });

  test("an option that does not exist, with what Nix suggests", () => {
    const out = error(
      "The option `services.openssh.enabel' does not exist. Definition values:\n- In `/a/x.nix': true\n\nDid you mean `services.openssh.enable', `services.openssh.banner' or `services.openssh.macs'?",
    );
    expect(parseEvaluation(out)).toMatchObject([
      {
        kind: "unknown-option",
        option: "services.openssh.enabel",
        suggestion: "services.openssh.enable",
        file: "/a/x.nix",
      },
    ]);
  });

  test("several options that do not exist share no file or suggestion", () => {
    const out = error("The options `a', `b' do not exist. Definition values:\n- In `/a/x.nix': 1");
    const found = parseEvaluation(out);
    expect(found.map((f) => f.option)).toEqual(["a", "b"]);
    expect(found.some((f) => f.file || f.suggestion)).toBe(false);
  });

  test("the warnings of the evaluation are kept and other notices are not", () => {
    const out = [
      line({
        action: "msg",
        level: 1,
        msg: `${ESC}[35;1mevaluation warning:${ESC}[0m old`,
        raw_msg: "old",
      }),
      line({
        action: "msg",
        level: 1,
        msg: "warning: Git tree is dirty",
        raw_msg: "Git tree is dirty",
      }),
      line({ action: "result", id: 3 }),
      "@nix {not json",
      "a line that is not Nix's data",
    ].join("\n");
    expect(parseEvaluation(out)).toEqual([{ kind: "warning", message: "old" }]);
  });

  test("the innermost of several errors is the one that counts", () => {
    const out = [error("outer"), error("Failed assertions:\n- first\n- second")].join("\n");
    expect(parseEvaluation(out).map((f) => [f.kind, f.message])).toEqual([
      ["assertion", "first"],
      ["assertion", "second"],
    ]);
  });

  test("an error Nix printed as plain text before it could speak in data is still read", () => {
    expect(parseEvaluation("error: flake 'x' does not provide attribute 'y'")).toEqual([
      { kind: "error", message: "flake 'x' does not provide attribute 'y'" },
    ]);
  });
});
