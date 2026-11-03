import { describe, expect, test } from "bun:test";
import type { IndexedOption } from "./catalog";
import { fixtures } from "./catalog/fixtures";
import { splitPath } from "./catalog/path";
import { buildTree } from "./catalog/tree";
import { validate } from "./validate";

const entry = (path: string, type: IndexedOption["type"], values?: string[]) =>
  ({ path, type, ...(values && { values }), segs: splitPath(path) }) as IndexedOption;

// A list of packages, an option that is one package, and a set of them.
const catalogs = {
  ...fixtures,
  nixos: buildTree([
    entry("env.packages", "list", ["pkg"]),
    entry("x.package", "mix", ["pkg"]),
    entry("many", "attrs", ["pkg"]),
    entry("either.value", "mix", ["pkg", "str"]),
  ]),
};
const errors = (src: string) =>
  validate(src, "nixos", catalogs).diagnostics.map((d) => [d.code, d.params.expected]);

describe("values for an option that takes packages", () => {
  test("what can be a package is accepted: a name, a call, a set, a path in the store, a lone interpolation", () => {
    expect(
      errors('{ env.packages = [ pkgs.git (pkgs.hello) { } "/nix/store/abc-x" "${pkgs.a}" ]; }'),
    ).toEqual([]);
    expect(errors("{ x.package = pkgs.git; }")).toEqual([]);
    expect(errors("{ x.package = null; }")).toEqual([]);
    expect(errors("{ many.a = pkgs.git; }")).toEqual([]);
  });

  test("a number, a boolean, a list or any other string is not a package", () => {
    expect(errors('{ env.packages = [ "git" ]; }')).toEqual([["type-mismatch", "list of package"]]);
    expect(errors("{ env.packages = [ 1 ]; }")).toEqual([["type-mismatch", "list of package"]]);
    expect(errors("{ env.packages = [ pkgs.git true ]; }")).toEqual([
      ["type-mismatch", "list of package"],
    ]);
    expect(errors('{ x.package = "git"; }')).toEqual([["type-mismatch", "package"]]);
    expect(errors("{ x.package = 5; }")).toEqual([["type-mismatch", "package"]]);
    expect(errors("{ x.package = [ pkgs.git ]; }")).toEqual([["type-mismatch", "package"]]);
    expect(errors('{ many.a = "git"; }')).toEqual([["type-mismatch", "package"]]);
  });

  test("an option that takes a package or a string takes either", () => {
    expect(errors('{ either.value = "git"; }')).toEqual([]);
    expect(errors("{ either.value = pkgs.git; }")).toEqual([]);
    expect(errors("{ either.value = 5; }")).toEqual([["type-mismatch", "package | str"]]);
  });
});
