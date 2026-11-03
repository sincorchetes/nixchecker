import { describe, expect, test } from "bun:test";
import { fixtures } from "./catalog/fixtures";
import { type TargetChoice, validate } from "./validate";

const codes = (src: string, choice: TargetChoice = "auto") =>
  validate(src, choice, fixtures).diagnostics.map((d) => d.code);

describe("a file that is no module of what it was guessed to be", () => {
  test("none of whose keys is an option: one warning, not an error for each", () => {
    const { diagnostics } = validate("{ toXmlAttrs = 1;\n  mkXmlAttr = 2; }", "auto", fixtures);
    expect(diagnostics).toEqual([
      { severity: "warning", code: "not-a-module", line: 1, col: 3, params: {} },
    ]);
  });

  test("a misspelling is close to a real option, and stays an error with its suggestion", () => {
    const [d] = validate("{ servces.openssh.enable = true; }", "auto", fixtures).diagnostics;
    expect(d).toMatchObject({ code: "unknown-option", severity: "error" });
    expect(d?.suggestion).toBeDefined();
  });

  test("a short key is not taken for a misspelling just because it is near a short name", () => {
    // `no` is two edits from `nix`, a root: a suggestion, but not a misspelling.
    expect(codes("{ no = 1; flag = 2; }")).toEqual(["not-a-module"]);
  });

  test("one key that is an option is enough for the others to be errors", () => {
    expect(codes('{ networking.hostName = "x"; toXmlAttrs = 1; }')).toEqual(["unknown-option"]);
  });

  test("a kind that was chosen is never second-guessed", () => {
    expect(codes("{ toXmlAttrs = 1; mkXmlAttr = 2; }", "nixos")).toEqual([
      "unknown-option",
      "unknown-option",
    ]);
  });

  test("what is wrong with how the file is written is still said", () => {
    expect(codes("{ toXmlAttrs = x; }")).toEqual(["not-a-module", "undefined-variable"]);
  });

  test("an option of the wrong type is a finding about options: it is not folded away", () => {
    expect(codes('{ networking.hostName = 5; toXmlAttrs = "x"; }')).toEqual([
      "type-mismatch",
      "unknown-option",
    ]);
  });
});
