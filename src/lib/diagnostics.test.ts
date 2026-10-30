import { describe, expect, test } from "bun:test";
import { fixtures } from "./catalog/fixtures";
import { type TargetChoice, validate } from "./validate";

const run = (src: string, choice: TargetChoice = "auto") => validate(src, choice, fixtures);
const codes = (src: string, choice?: TargetChoice) =>
  run(src, choice).diagnostics.map((d) => d.code);

describe("undefined variables", () => {
  const undefinedNames = (src: string) =>
    run(src)
      .diagnostics.filter((d) => d.code === "undefined-variable")
      .map((d) => d.params.name);

  test("flags a lone name that nothing declares", () => {
    const report = run("{ pkgs }:\n{\nservices.openssh = ena;\n}");
    expect(report.diagnostics).toMatchObject([
      { severity: "error", code: "undefined-variable", line: 3, col: 20, params: { name: "ena" } },
    ]);
  });

  test("accepts names from arguments, let, lambdas and globals", () => {
    expect(undefinedNames("{ pkgs, host ? 1 }: { networking.hostName = host; }")).toEqual([]);
    expect(undefinedNames("{ last }: { networking.hostName = last; }")).toEqual([]);
    expect(undefinedNames("args@{ ... }: { networking.hostName = args; }")).toEqual([]);
    expect(undefinedNames("let name = 1; in { networking.hostName = name; }")).toEqual([]);
    expect(undefinedNames("{ networking.hostName = null; }")).toEqual([]);
    expect(undefinedNames("{ services.openssh.enable = true; }")).toEqual([]);
  });

  test("stays silent when `with` may bring in any name", () => {
    expect(undefinedNames("with lib; { networking.hostName = whatever; }")).toEqual([]);
  });
});

describe("missing semicolons", () => {
  test("flags the last assignment of a set when its `;` is missing", () => {
    const report = run("{ pkgs }:\n\n{\nservices.openssh = ena\n}");
    expect(report.diagnostics.map((d) => [d.code, d.line, d.col])).toEqual([
      ["undefined-variable", 4, 20],
      ["syntax-unterminated", 4, 23],
    ]);
  });

  test("still checks the value's type when the `;` is missing", () => {
    expect(codes('{ networking.firewall.enable = "yes" }')).toEqual([
      "type-mismatch",
      "syntax-unterminated",
    ]);
    expect(codes("{ services.openssh = { enable = true; } }")).toEqual(["syntax-unterminated"]);
    expect(codes("{ services.openssh.enable = true; }")).toEqual([]);
  });
});

describe("expression types", () => {
  test("checks the value under mkDefault and friends", () => {
    expect(codes('{ networking.firewall.enable = lib.mkDefault "yes"; }')).toEqual([
      "type-mismatch",
    ]);
    expect(codes("{ networking.firewall.enable = lib.mkForce false; }")).toEqual([]);
  });

  test("a boolean expression is not a string or a list", () => {
    expect(codes("{ x }: { networking.hostName = !x; }")).toEqual(["type-mismatch"]);
    expect(codes("{ x }: { networking.firewall.enable = !x; }")).toEqual([]);
    expect(codes("{ x, y }: { networking.firewall.enable = x == y; }")).toEqual([]);
  });

  test("an interpolated string where a boolean goes is an error, and fits a string", () => {
    expect(codes('{ x }: { networking.firewall.enable = "a-${x}"; }')).toEqual(["type-mismatch"]);
    expect(codes('{ x }: { networking.hostName = "a-${x}"; }')).toEqual([]);
  });
});

describe("what the catalog offers", () => {
  test("a path cut off by a dangling dot is an error that lists the options after it", () => {
    const [d] = run("{\n  services.openssh.enable = true;\n  services.openssh.\n}").diagnostics;
    expect(d).toMatchObject({
      severity: "error",
      code: "syntax-incomplete",
      line: 3,
      params: { path: "services.openssh" },
      options: ["enable", "ports", "settings"],
      docUrl: "https://search.nixos.org/options?query=services.openssh",
    });
  });

  test("an unknown root gets a search link and the roots that exist", () => {
    const [d] = run("{ services.openssh.enable = true;\n  gnome.\n}").diagnostics;
    expect(d).toMatchObject({
      code: "syntax-incomplete",
      docUrl: expect.stringContaining("gnome"),
    });
    expect(d?.options).toContain("services");
  });

  test("an unknown option lists what exists there, nearest to the typo first", () => {
    const [d] = run("{ services.openssh.enabel = true; }").diagnostics;
    expect(d?.options).toEqual(["enable", "ports", "settings"]);
    expect(run("{ zzzzzz.qqqqqq = 1; }").diagnostics[0]?.options?.length).toBeGreaterThan(3);
  });
});

describe("calls that cannot work", () => {
  test("a list called as a function is an error that hints at the missing operator", () => {
    const src = `{
  outputs = inputs: let
    common = [ ./a.nix ];
  in {
    nixosConfigurations.x = lib.nixosSystem {
      modules = common  [ ./b.nix ];
    };
  };
}`;
    expect(run(src).diagnostics).toMatchObject([
      {
        severity: "error",
        code: "not-callable-list",
        line: 6,
        col: 17,
        params: { name: "common" },
      },
    ]);
    expect(codes("{ a = [ 1 ] [ 2 ]; }")).toContain("not-callable-list");
    expect(codes('{ a = "x" y; }')).toContain("not-callable-string");
    expect(codes("{ a = 1 y; }")).toContain("not-callable-number");
    expect(codes("{ a = [ 1 ] + [ 2 ]; }")).toContain("list-plus");
    expect(codes('{ a = "x" ++ [ 2 ]; }')).toContain("concat-non-list");
  });
});
