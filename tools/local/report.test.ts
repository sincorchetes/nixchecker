import { describe, expect, test } from "bun:test";
import type { Assignment } from "../../src/lib/nix/scan";
import { fromFinding } from "./report";

const assignments = [{ path: ["networking", "hostName"], line: 3, col: 5 }] as Assignment[];
const finding = { kind: "type-error", option: "networking.hostName", message: "bad" } as const;

describe("place a finding of Nix", () => {
  test("in the checked file, at the assignment", () => {
    const placed = fromFinding({ ...finding, file: "./a.nix" }, assignments, "a.nix");
    expect(placed).toMatchObject({ line: 3, col: 5, message: "bad" });
  });

  test("in an imported file, by its name and without a line of this file", () => {
    const placed = fromFinding({ ...finding, file: "/x/other.nix" }, assignments, "a.nix");
    expect(placed.line).toBeUndefined();
    expect(placed.message).toBe("bad (defined in /x/other.nix)");
  });
});
