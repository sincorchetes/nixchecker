import { describe, expect, test } from "bun:test";
import { reconcile } from "./reconcile";
import type { Located } from "./report";

const staticItem = (code: string, line = 1): Located => ({
  level: "static",
  severity: "error",
  message: code,
  code,
  line,
  col: 3,
});
const nixError: Located = { level: "evaluation", severity: "error", message: "x", line: 1, col: 3 };

describe("reconcile static findings with Nix", () => {
  test("changes nothing when Nix did not run", () => {
    const items = [staticItem("unknown-option")];
    expect(reconcile(items, false)).toEqual({ items, refuted: 0, merged: 0 });
  });

  test("drops the findings Nix settled when it accepts the module", () => {
    const r = reconcile([staticItem("unknown-option"), staticItem("type-mismatch", 2)], true);
    expect(r).toEqual({ items: [], refuted: 2, merged: 0 });
  });

  test("keeps the findings Nix does not judge", () => {
    const deprecated = staticItem("deprecated");
    expect(reconcile([deprecated], true).items).toEqual([deprecated]);
  });

  test("merges a static finding Nix confirmed at the same place", () => {
    const other = staticItem("unknown-option", 5);
    const r = reconcile([staticItem("type-mismatch"), other, nixError], true);
    expect(r.items).toEqual([other, nixError]);
    expect(r.merged).toBe(1);
    expect(r.refuted).toBe(0);
  });
});
