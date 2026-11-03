import { describe, expect, test } from "bun:test";
import { highlight, type Mark, segments } from "./highlight";

const kinds = (src: string) => highlight(src).map((s) => [s.kind, src.slice(s.start, s.end)]);

describe("highlight", () => {
  test("comments, numbers and keywords", () => {
    expect(kinds("# note\nlet x = 12; in x /* c */")).toEqual([
      ["comment", "# note"],
      ["keyword", "let"],
      ["number", "12"],
      ["keyword", "in"],
      ["comment", "/* c */"],
    ]);
    expect(kinds("true or null")).toEqual([
      ["keyword", "true"],
      ["keyword", "or"],
      ["keyword", "null"],
    ]);
  });

  test("names that merely contain a keyword are plain", () => {
    expect(kinds("inputs letter x1")).toEqual([]);
  });

  test("an unclosed comment runs to the end", () => {
    expect(kinds("a /* open")).toEqual([["comment", "/* open"]]);
    expect(kinds("# last line")).toEqual([["comment", "# last line"]]);
  });

  test("strings, with escapes and interpolations inside", () => {
    expect(kinds('"a\\"b" "x ${ "}" + y } z"')).toEqual([
      ["string", '"a\\"b"'],
      ["string", '"x ${ "}" + y } z"'],
    ]);
    expect(kinds('"open')).toEqual([["string", '"open']]);
    expect(kinds('"a ${ { b = 1; }.b } c"')).toEqual([["string", '"a ${ { b = 1; }.b } c"']]);
  });

  test("indented strings end at '' unless escaped", () => {
    expect(kinds("'' a ''$ b ''\\n c ''' d '' x")).toEqual([
      ["string", "'' a ''$ b ''\\n c ''' d ''"],
    ]);
    expect(kinds("'' a ${ x } b ''")).toEqual([["string", "'' a ${ x } b ''"]]);
    expect(kinds("'' never closed")).toEqual([["string", "'' never closed"]]);
  });

  test("paths, but not the // operator or a division", () => {
    expect(kinds("[ ./a/b ../c ~/d /etc/e <nixpkgs> ]")).toEqual([
      ["path", "./a/b"],
      ["path", "../c"],
      ["path", "~/d"],
      ["path", "/etc/e"],
      ["path", "<nixpkgs>"],
    ]);
    expect(kinds("a // b")).toEqual([]);
  });
});

describe("segments", () => {
  const src = 'a = "x";';
  const spans = highlight(src);

  test("cover the whole text, colored where highlighted", () => {
    const parts = segments(src, spans, []);
    expect(parts.map((p) => p.text).join("")).toBe(src);
    expect(parts.find((p) => p.text === '"x"')).toMatchObject({ kind: "string" });
    expect(parts.some((p) => p.severity)).toBe(false);
  });

  test("underline the marks, an error over a warning, across colors", () => {
    const marks: Mark[] = [
      { start: 2, end: 5, severity: "warning" },
      { start: 4, end: 6, severity: "error" },
    ];
    const parts = segments(src, spans, marks);
    expect(parts.map((p) => [p.text, p.kind, p.severity])).toEqual([
      ["a ", undefined, undefined],
      ["= ", undefined, "warning"],
      ['"', "string", "error"],
      ["x", "string", "error"],
      ['"', "string", undefined],
      [";", undefined, undefined],
    ]);
  });

  test("ignore marks outside the text", () => {
    const parts = segments("ab", [], [{ start: 5, end: 9, severity: "error" }]);
    expect(parts).toEqual([{ text: "ab" }]);
  });
});
