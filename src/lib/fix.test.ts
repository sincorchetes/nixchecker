import { describe, expect, test } from "bun:test";
import { fixtures } from "./catalog/fixtures";
import { applyAll, applyFix, replacementOf, wordAt } from "./fix";
import { validate } from "./validate";

const first = (src: string) => {
  const d = validate(src, "nixos", fixtures).diagnostics[0];
  if (!d) throw new Error("no diagnostic");
  return d;
};

describe("applyFix", () => {
  test("fixes a typo at the start of a line", () => {
    const src = "{\n  services.openssh.enabel = true;\n}";
    expect(applyFix(src, first(src))).toBe("{\n  services.openssh.enable = true;\n}");
  });

  test("fixes only the written tail inside a nested set", () => {
    const src = "{ services.openssh = { enabel = true; }; }";
    expect(applyFix(src, first(src))).toBe("{ services.openssh = { enable = true; }; }");
  });

  test("applies renames at the top level", () => {
    const src = "{ services.xserver.displayManager.gdm.enable = true; }";
    expect(applyFix(src, first(src))).toBe("{ services.displayManager.gdm.enable = true; }");
  });

  test("declines when the head would change or nothing is proposed", () => {
    const nested = "{ services.xserver.displayManager = { gdm.enable = true; }; }";
    expect(applyFix(nested, first(nested))).toBeUndefined();
    const mismatch = '{ networking.firewall.enable = "yes"; }';
    expect(replacementOf(first(mismatch))).toBeUndefined();
    expect(applyFix(mismatch, first(mismatch))).toBeUndefined();
  });

  test("declines when the text no longer matches the diagnostic", () => {
    const src = "{ services.openssh.enabel = true; }";
    expect(applyFix("{ other = 1; }", first(src))).toBeUndefined();
  });
});

describe("applyAll and wordAt", () => {
  const src =
    "{\n  services.openssh.enabel = true;\n  services.xserver.displayManager.gdm.enable = true;\n}";

  test("applies every fix, last first, leaving the rest alone", () => {
    const diagnostics = validate(src, "nixos", fixtures).diagnostics;
    expect(applyAll(src, diagnostics)).toBe(
      "{\n  services.openssh.enable = true;\n  services.displayManager.gdm.enable = true;\n}",
    );
    expect(applyAll("{ x = 1; }", diagnostics)).toBe("{ x = 1; }");
  });

  test("finds the word at a position", () => {
    const [start, end] = wordAt(src, 2, 3);
    expect(src.slice(start, end)).toBe("services.openssh.enabel");
    expect(wordAt("", 1, 1)).toEqual([0, 0]);
  });
});
