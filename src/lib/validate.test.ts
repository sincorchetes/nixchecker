import { describe, expect, test } from "bun:test";
import { docUrl, TARGETS } from "./catalog";
import { fixtures } from "./catalog/fixtures";
import { EXAMPLE } from "./example";
import { scan } from "./nix/scan";
import { tokenize } from "./nix/tokenize";
import { analyze, detectTarget, resolveTarget, type TargetChoice, validate } from "./validate";

const run = (src: string, choice: TargetChoice = "auto") => validate(src, choice, fixtures);
const codes = (src: string, choice?: TargetChoice) =>
  run(src, choice).diagnostics.map((d) => d.code);

describe("validate", () => {
  test("accepts a correct NixOS module", () => {
    const report = run(
      '{ pkgs, ... }: { services.openssh = { enable = true; ports = [ 22 ]; }; networking.hostName = "x"; }',
    );
    expect(report).toEqual({ target: "nixos", diagnostics: [] });
  });

  test("flags unknown options with a suggestion and docs link", () => {
    const [d] = run("{ services.openssh.enabel = true; }").diagnostics;
    expect(d).toMatchObject({
      severity: "error",
      code: "unknown-option",
      line: 1,
      suggestion: "services.openssh.enable",
      docUrl: "https://search.nixos.org/options?query=services.openssh.enable",
    });
  });

  test("falls back to a global search when the typo is not in the first unknown segment", () => {
    expect(run("{ servics.openssh.enable = true; }").diagnostics[0]?.suggestion).toBe(
      "services.openssh.enable",
    );
  });

  test("reports an unknown group once, not once per child", () => {
    const src = "{ servics.openssh = { enable = true; ports = [ 22 ]; }; }";
    expect(codes(src)).toEqual(["unknown-option"]);
  });

  test("omits the suggestion when nothing is close, and never suggests hidden options", () => {
    const [d] = run("{ zzzzzz.qqqqqq = 1; }").diagnostics;
    expect(d?.suggestion).toBeUndefined();
    expect(run("{ boot.cleanTmpDi = 1; }").diagnostics[0]?.suggestion).toBeUndefined();
  });

  test("checks value types", () => {
    const [d] = run('{ networking.firewall.enable = "yes"; }').diagnostics;
    expect(d).toMatchObject({
      code: "type-mismatch",
      params: { path: "networking.firewall.enable", expected: "bool", got: "str" },
    });
    expect(codes("{ networking.firewall.allowedTCPPorts = 22; }")).toEqual(["type-mismatch"]);
    expect(codes("{ users.users = [ ]; }")).toEqual(["type-mismatch"]);
  });

  test("lets a number through where the manuals say string (coercion)", () => {
    expect(codes("{ networking.hostName = 5; }")).toEqual([]);
    expect(codes("{ networking.hostName = [ ]; }")).toEqual(["type-mismatch"]);
  });

  test("lets opaque values and wildcard submodules through", () => {
    const src = `{
      networking.hostName = lib.mkForce "x";
      services.nginx.virtualHosts."example.org".root = "/srv";
      users.users.alice.isNormalUser = true;
      users.users.alice = { description = "A"; };
      environment.variables.EDITOR = "vim";
      services.openssh.settings.PermitRootLogin = "no";
      home-manager.users.alice = { home.stateVersion = "24.11"; };
    }`;
    expect(codes(src)).toEqual([]);
  });

  test("requires a set where only a group exists", () => {
    expect(codes("{ services.openssh = true; }")).toEqual(["type-mismatch"]);
    expect(codes("{ services.openssh = lib.mkIf x { enable = true; }; }")).toEqual([]);
  });

  test("warns about renamed options", () => {
    const [d] = run("{ services.xserver.displayManager.gdm.enable = true; }").diagnostics;
    expect(d).toMatchObject({
      severity: "warning",
      code: "deprecated",
      params: { replacement: "services.displayManager.gdm.enable" },
    });
  });

  test("warns about hidden options, once per hidden owner", () => {
    const [d] = run("{ boot.cleanTmpDir = true; }").diagnostics;
    expect(d).toMatchObject({ severity: "warning", code: "hidden-option" });
    const nested = "{ boot.cleanTmpDir.a = 1; boot.cleanTmpDir.b = 2; }";
    expect(run(nested).diagnostics).toMatchObject([
      { code: "hidden-option", params: { path: "boot.cleanTmpDir" } },
    ]);
  });

  test("reports syntax errors only, in order", () => {
    const report = run('{ a = "x;\n b = 1; }');
    expect(report.diagnostics.map((d) => d.code)).toEqual([
      "syntax-unbalanced",
      "syntax-unterminated-string",
    ]);
    const lines = run("{ a = [\n}").diagnostics;
    expect(lines.map((d) => [d.line, d.col])).toEqual([
      [1, 1],
      [2, 1],
    ]);
  });

  test("validates enums for disko, with free-form content", () => {
    const ok = `{ disko.devices.disk.main = { type = "disk"; device = "/dev/sda";
      content = { type = "gpt"; partitions.root = { size = "100%"; content = { type = "filesystem"; format = "ext4"; mountpoint = "/"; }; }; }; }; }`;
    expect(run(ok)).toEqual({ target: "disko", diagnostics: [] });
    expect(codes('{ disko.devices.disk.main.content.type = "nope"; }')).toEqual(["type-mismatch"]);
    expect(codes("{ disko.devices.disk.main.content.type = 1; }")).toEqual(["type-mismatch"]);
    expect(codes("{ x }: { disko.devices.disk.main.content.type = x; }")).toEqual([]);
    expect(codes('{ disko.devices.disk.main.content.extra = "y"; }')).toEqual([]);
  });

  test("validates flakes", () => {
    const flake = `{
      description = "demo";
      inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
      inputs.hm = { url = "github:nix-community/home-manager"; inputs.nixpkgs.follows = "nixpkgs"; };
      outputs = { self, nixpkgs }: { packages = {}; };
    }`;
    expect(run(flake)).toEqual({ target: "flake", diagnostics: [] });
    expect(codes('{ outputs = x: {}; descripton = "a"; }')).toEqual(["unknown-option"]);
  });

  test("honors an explicit target over detection", () => {
    expect(run('{ home.stateVersion = "24.11"; }').target).toBe("home-manager");
    expect(codes('{ home.stateVersion = "24.11"; }', "nixos")).toEqual(["unknown-option"]);
  });

  test("flags an assignment without `= value;`, and what came before still gets checked", () => {
    const report = run('{ networking.firewall.enable = "yes";\n  services.opnssh }');
    expect(report.diagnostics.map((d) => d.code)).toEqual(["type-mismatch", "syntax-incomplete"]);
    expect(codes("{ services.openssh }")).toEqual(["syntax-incomplete"]);
  });

  test("warns when there is no attribute set to read, instead of passing silently", () => {
    const report = run("{ pkgs }:\n\nservices.openssh.enable = 1;");
    expect(report.diagnostics).toMatchObject([
      { severity: "warning", code: "nothing-to-check", line: 1, col: 1 },
    ]);
    expect(codes("{ }")).toEqual(["nothing-to-check"]);
    expect(codes("")).toEqual([]);
  });

  test("reports every mistake in the bundled example", () => {
    expect(codes(EXAMPLE)).toEqual(["type-mismatch", "unknown-option", "deprecated"]);
  });
});

describe("analyze", () => {
  test("splits work so the catalog can be loaded in between", () => {
    const analysis = analyze("{ inputs.x.url = 1; }");
    expect(analysis.syntax).toEqual([]);
    expect(resolveTarget(analysis, "auto")).toBe("flake");
    expect(resolveTarget(analysis, "disko")).toBe("disko");
    expect(analyze("{ a = ").syntax.length).toBeGreaterThan(0);
    expect(analyze("{ a = ").assignments).toEqual([]);
  });
});

describe("detectTarget", () => {
  test("recognizes each target", () => {
    const target = (src: string) => detectTarget(scan(tokenize(src).tokens));
    expect(target("{ a.b = 1; }")).toBe("nixos");
    expect(target("{ inputs.x.url = 1; }")).toBe("flake");
    expect(target("{ nixConfig.x = 1; }")).toBe("flake");
    expect(target("{ disko.devices = {}; }")).toBe("disko");
    expect(target("{ home.username = 1; }")).toBe("home-manager");
  });
});

describe("docUrl", () => {
  test("links every target to its official documentation", () => {
    expect(TARGETS.map((t) => docUrl(t))).toEqual([
      "https://search.nixos.org/options?query=",
      "https://nix-community.github.io/home-manager/options.xhtml",
      "https://github.com/nix-community/disko/blob/master/docs/reference.md",
      "https://nix.dev/manual/nix/latest/command-ref/new-cli/nix3-flake.html#flake-format",
    ]);
    expect(docUrl("home-manager", "programs.git.enable")).toEndWith("#opt-programs.git.enable");
    expect(docUrl("home-manager", "a.*.b")).toEndWith("#opt-a._name_.b");
  });
});

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
      ["syntax-unterminated", 4, 1],
      ["undefined-variable", 4, 20],
    ]);
  });

  test("still checks the value's type when the `;` is missing", () => {
    expect(codes('{ networking.firewall.enable = "yes" }')).toEqual([
      "syntax-unterminated",
      "type-mismatch",
    ]);
    expect(codes("{ services.openssh = { enable = true; } }")).toEqual(["syntax-unterminated"]);
    expect(codes("{ services.openssh.enable = true; }")).toEqual([]);
  });
});
