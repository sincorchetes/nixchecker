import { describe, expect, test } from "bun:test";
import { BASE, type Roots, systemExpression } from "./expressions";

const roots: Roots = {
  nixpkgs: "/np",
  homeManager: "/hm",
  disko: "/dk",
  nixDarwin: "/nd",
  system: "aarch64-linux",
};
const expression = (kind: Parameters<typeof systemExpression>[0], r: Roots = roots) =>
  systemExpression(kind, r, "{ file }", "true");

describe("systemExpression", () => {
  test("each kind builds its own system out of its own sources, for the system asked", () => {
    expect(expression("nixos")).toContain('import ("/np" + "/nixos/lib/eval-config.nix")');
    expect(expression("nixos")).toContain('system = "aarch64-linux";');
    expect(expression("home-manager")).toContain('import ("/hm" + "/modules")');
    expect(expression("home-manager")).toContain('import "/np" { system = "aarch64-linux"; }');
    expect(expression("nix-darwin")).toContain('import "/nd" {');
    expect(expression("nix-darwin")).toContain('system = "aarch64-linux";');
    expect(expression("disko")).toContain('"/dk" + "/module.nix"');
  });

  test("modules of other projects are added to the system, and nowhere else", () => {
    const added = { ...roots, modules: ["/m/one.nix", "/m/two.nix"] };
    expect(expression("nixos", added)).toContain('modules = [ file "/m/one.nix" "/m/two.nix"');
    expect(expression("home-manager", added)).toContain(
      'imports = [ file "/m/one.nix" "/m/two.nix"',
    );
    expect(expression("nixos")).not.toContain("/m/one.nix");
  });

  test("a lenient run turns the check of unknown options off", () => {
    expect(systemExpression("nixos", roots, "{ file }", "true", true)).toContain(
      "_module.check = false",
    );
    expect(expression("nixos")).not.toContain("_module.check");
  });

  test("every kind has an option every system has, to read first", () => {
    expect(Object.keys(BASE).sort()).toEqual(["disko", "home-manager", "nix-darwin", "nixos"]);
  });
});
