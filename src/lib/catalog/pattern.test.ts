import { describe, expect, test } from "bun:test";
import { isPatternKind, matches, patternKind, patternOf } from "./pattern";

describe("pattern kinds", () => {
  test("round-trip an expression, keeping the separators of kinds out of it", () => {
    const kind = patternKind("[a-z]+:x");
    expect(kind.slice(3)).not.toMatch(/[+:]/);
    expect(isPatternKind(kind)).toBe(true);
    expect(isPatternKind("str")).toBe(false);
    expect(patternOf(kind)).toBe("[a-z]+:x");
  });

  test("a string has to match all of the expression", () => {
    const kind = patternKind("[a-z]+[.]service");
    expect(matches(kind, "a.service")).toBe(true);
    expect(matches(kind, "a.service.x")).toBe(false);
    expect(matches(kind, "x")).toBe(false);
  });

  test("POSIX classes are read as Nix reads them", () => {
    const kind = patternKind("[[:alpha:]][[:alnum:]]*");
    expect(matches(kind, "a1")).toBe(true);
    expect(matches(kind, "1a")).toBe(false);
  });

  test("what cannot be read, or is not written out, is not judged", () => {
    expect(matches(patternKind("[[:bogus:]]"), "x")).toBe(true);
    expect(matches(patternKind("(unclosed"), "x")).toBe(true);
    expect(matches(patternKind("a"), undefined)).toBe(true);
  });
});
