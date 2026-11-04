import { describe, expect, test } from "bun:test";
import { looksLikeConf, parseConf } from "./parse";

const kinds = (text: string) =>
  parseConf(text).assignments.map((a) => [a.path.join("."), a.kind, a.value ?? a.itemValues]);

describe("parseConf", () => {
  test("a setting is a name, an =, and the words of its value", () => {
    expect(
      kinds("experimental-features = nix-command flakes\nkeep-going = true\ncores = 4\n"),
    ).toEqual([
      ["experimental-features", "list", ["nix-command", "flakes"]],
      ["keep-going", "bool", undefined],
      ["cores", "int", undefined],
    ]);
  });

  test("a single word is text, and an empty value is empty text", () => {
    expect(kinds("max-jobs = auto\nbuilders =")).toEqual([
      ["max-jobs", "str", "auto"],
      ["builders", "str", ""],
    ]);
  });

  test("a word that depends on the setting (yes, 1, 128M, 50%) is left unjudged", () => {
    expect(kinds("a = yes\nb = 1\nc = 128M\nd = 50%").map((k) => k[1])).toEqual([
      "other",
      "other",
      "other",
      "other",
    ]);
  });

  test("comments, blank lines and includes are not settings, and a comment can follow a value", () => {
    const analysis = parseConf(
      "# a comment\n\ninclude /etc/nix/extra.conf\n!include /nope\ncores = 2 # four\n",
    );
    expect(analysis.syntax).toEqual([]);
    expect(analysis.assignments).toMatchObject([{ path: ["cores"], kind: "int", line: 5, col: 1 }]);
  });

  test("a line that is not a setting is a syntax error where it is", () => {
    const { syntax, assignments } = parseConf(
      "  cores=2\nbad line here\ninclude\ninclude a b\nok = 1\n",
    );
    expect(syntax.map((d) => [d.code, d.line, d.col, d.params.text])).toEqual([
      ["conf-bad-line", 1, 3, "cores=2"],
      ["conf-bad-line", 2, 1, "bad line here"],
      ["conf-bad-line", 3, 1, "include"],
      ["conf-bad-line", 4, 1, "include a b"],
    ]);
    expect(assignments.map((a) => a.path[0])).toEqual(["ok"]);
  });

  test("the position is that of the name, and Windows line ends do not matter", () => {
    expect(parseConf("  cores = 2\r\n").assignments[0]).toMatchObject({
      line: 1,
      col: 3,
      kind: "int",
    });
  });
});

describe("looksLikeConf", () => {
  test("settings, comments and includes only", () => {
    expect(looksLikeConf("# nix\nexperimental-features = nix-command flakes\ninclude /x\n")).toBe(
      true,
    );
    expect(looksLikeConf("keep-going =\n")).toBe(true);
  });

  test("not Nix, not an empty text, and not only includes", () => {
    expect(looksLikeConf("{ a = 1; }")).toBe(false);
    expect(looksLikeConf("a = 1;")).toBe(false);
    expect(looksLikeConf("a = { b = 1; }")).toBe(false);
    expect(looksLikeConf("")).toBe(false);
    expect(looksLikeConf("# nothing\n")).toBe(false);
    expect(looksLikeConf("include /x")).toBe(false);
    expect(looksLikeConf("a=1")).toBe(false);
  });
});
