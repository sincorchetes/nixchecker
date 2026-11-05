import { describe, expect, test } from "bun:test";
import { mismatch } from "./verify";

describe("mismatch", () => {
  test("a tag that is the version of the package is fine", () => {
    expect(mismatch("v0.0.2", "0.0.2")).toBeUndefined();
  });

  test("a tag that is not says what to change", () => {
    expect(mismatch("v0.0.3", "0.0.2")).toContain('set "version" to 0.0.3');
  });

  test("a tag of another shape is not a release", () => {
    expect(mismatch("0.0.2", "0.0.2")).toContain("is not of the form");
    expect(mismatch("v1", "1")).toContain("is not of the form");
  });
});
