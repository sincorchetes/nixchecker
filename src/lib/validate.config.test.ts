import { describe, expect, test } from "bun:test";
import { fixtures } from "./catalog/fixtures";
import { analyze, validate } from "./validate";

const run = (src: string) => validate(src, "auto", fixtures);

describe("options written under config", () => {
  test("are the same options as written without it", () => {
    for (const src of [
      "{ config = { networking.hostName = 5; }; }",
      "{ config.networking.hostName = 5; }",
      "{ config = { networking = { hostName = 5; }; }; }",
    ]) {
      const { diagnostics } = run(src);
      expect(diagnostics.map((d) => [d.code, d.params.path])).toEqual([
        ["type-mismatch", "networking.hostName"],
      ]);
    }
    expect(run("{ config.services.openssh.enabel = true; }").diagnostics[0]).toMatchObject({
      code: "unknown-option",
      params: { path: "services.openssh.enabel" },
    });
    expect(run("{ config = { services.openssh.enable = true; }; }").diagnostics).toEqual([]);
  });

  test("keep the place they are written at", () => {
    const [found] = analyze("{\n  config = {\n    networking.hostName = 5;\n  };\n}").assignments;
    expect(found).toMatchObject({ path: ["networking", "hostName"], line: 3, col: 5 });
  });

  test("a config that is not a set of options is left as it is", () => {
    const { assignments } = analyze("{ config = lib.mkIf true { }; }");
    expect(assignments.map((a) => a.path)).toEqual([["config"]]);
  });

  test("tell what kind of file it is as well as the options without it do", () => {
    expect(run("{ config.home.packages = [ ]; }").target).toBe("home-manager");
  });
});
