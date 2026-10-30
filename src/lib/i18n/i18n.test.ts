import { describe, expect, test } from "bun:test";
import { withBase } from "../site";
import { closest, distance } from "../suggest";
import { format, LANGS, messages } from "./index";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("messages", () => {
  test("every language has the same keys", () => {
    const keys = Object.keys(messages.es).sort();
    for (const lang of LANGS) expect(Object.keys(messages[lang]).sort()).toEqual(keys);
  });

  test("translations keep the same placeholders", () => {
    for (const [key, text] of Object.entries(messages.es)) {
      expect(placeholders(messages.en[key as keyof typeof messages.en])).toEqual(
        placeholders(text),
      );
    }
  });

  test("no translation is empty", () => {
    for (const lang of LANGS) {
      for (const text of Object.values(messages[lang])) expect(text.trim()).not.toBe("");
    }
  });
});

describe("format", () => {
  test("fills placeholders and keeps unknown ones", () => {
    expect(format("{a} and {b} and {a}", { a: 1, b: "x" })).toBe("1 and x and 1");
    expect(format("{missing}")).toBe("{missing}");
  });
});

describe("withBase", () => {
  test("joins base and path with a single slash", () => {
    expect(withBase("/")).toBe("/");
    expect(withBase("/", "/en/")).toBe("/en/");
    expect(withBase("/repo", "en/")).toBe("/repo/en/");
  });
});

describe("suggest", () => {
  test("measures edit distance", () => {
    expect(distance("kitten", "sitting")).toBe(3);
    expect(distance("", "abc")).toBe(3);
    expect(distance("git", "gti")).toBe(1);
  });

  test("returns only close matches", () => {
    expect(closest("enabel", ["enable", "other"])).toBe("enable");
    expect(closest("xxxxxx", ["enable"])).toBeUndefined();
  });
});
