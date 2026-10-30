import { describe, expect, test } from "bun:test";
import { fixtures } from "./catalog/fixtures";
import { validate } from "./validate";

const run = (src: string) => validate(src, "auto", fixtures);

describe("coverage", () => {
  test("counts only what the catalog could not verify", () => {
    const unchecked = (src: string) => run(src).coverage.skipped.length;
    expect(
      unchecked("{ x }: { networking.hostName = x; networking.useDHCP = true; foo.bar = 1; }"),
    ).toBe(1);
    expect(unchecked("{ services.openssh = lib.mkIf x { enable = true; }; }")).toBe(1);
    expect(unchecked("{ outputs = {}; }")).toBe(1);
    const disko = (type: string) => `{ disko.devices.disk.main.content.type = ${type}; }`;
    expect(unchecked(disko('"gpt"'))).toBe(0);
    expect(unchecked(disko('"nope"'))).toBe(0);
    expect(unchecked(disko('"${x}"'))).toBe(1);
    expect(unchecked(disko("1"))).toBe(0);
  });

  test("says why each assignment was skipped", () => {
    const causes = (src: string) => run(src).coverage.skipped.map((s) => s.cause);
    expect(causes("{ x }: { networking.hostName = x; services.openssh = lib.mkIf x {}; }")).toEqual(
      ["dynamic", "dynamic"],
    );
    expect(causes("{ outputs = {}; }")).toEqual(["any"]);
    expect(causes('{ disko.devices.disk.main.content.type = "${x}"; }')).toEqual(["interpolated"]);
    expect(causes('{ disko.devices.disk.main.content.extra = "y"; }')).toEqual(["free-form"]);
  });
});
