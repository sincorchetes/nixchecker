import { describe, expect, test } from "bun:test";
import type { Assignment } from "../../src/lib/nix/scan";
import { fromFinding, isImported } from "./report";

const assignments = [{ path: ["networking", "hostName"], line: 3, col: 5 }] as Assignment[];
const finding = { kind: "type-error", option: "networking.hostName", message: "bad" } as const;

describe("place a finding of Nix", () => {
  test("in the checked file, at the assignment", () => {
    const placed = fromFinding({ ...finding, file: "./a.nix" }, assignments, "a.nix");
    expect(placed).toEqual({
      level: "evaluation",
      severity: "error",
      message: "bad",
      line: 3,
      col: 5,
    });
  });

  test("in an imported file, with its name and the place in that file", () => {
    const there = [{ path: ["networking", "hostName"], line: 1, col: 19 }] as Assignment[];
    const placed = fromFinding({ ...finding, file: "/x/other.nix" }, there, "a.nix");
    expect(placed).toMatchObject({ file: "/x/other.nix", line: 1, col: 19, message: "bad" });
  });

  test("an imported file that could not be read still names the file, with no place", () => {
    const placed = fromFinding({ ...finding, file: "/x/other.nix" }, [], "a.nix");
    expect(placed.file).toBe("/x/other.nix");
    expect(placed.line).toBeUndefined();
  });

  test("the configuration of a flake it was found in is data of its own", () => {
    const placed = fromFinding({ ...finding, config: "nixosConfigurations.box" }, [], "flake.nix");
    expect(placed).toMatchObject({ config: "nixosConfigurations.box", message: "bad" });
  });

  test("a file is imported when it is not the one checked", () => {
    expect(isImported({ ...finding, file: "./a.nix" }, "a.nix")).toBe(false);
    expect(isImported({ ...finding, file: "/x/b.nix" }, "a.nix")).toBe(true);
    expect(isImported(finding, "a.nix")).toBe(false);
  });
});
