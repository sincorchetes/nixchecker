import { describe, expect, test } from "bun:test";
import { fixtures } from "./catalog/fixtures";
import { type TargetChoice, validate } from "./validate";

const run = (src: string, choice: TargetChoice = "auto") => validate(src, choice, fixtures);
const codes = (src: string, choice?: TargetChoice) =>
  run(src, choice).diagnostics.map((d) => d.code);

describe("value types", () => {
  test("checks value types", () => {
    const [d] = run('{ networking.firewall.enable = "yes"; }').diagnostics;
    expect(d).toMatchObject({
      code: "type-mismatch",
      params: { path: "networking.firewall.enable", expected: "bool", got: "str" },
    });
    expect(codes("{ networking.firewall.allowedTCPPorts = 22; }")).toEqual(["type-mismatch"]);
    expect(codes("{ users.users = [ ]; }")).toEqual(["type-mismatch"]);
  });

  test("a string option takes only a string", () => {
    expect(codes("{ networking.hostName = 5; }")).toEqual(["type-mismatch"]);
    expect(codes("{ networking.hostName = [ ]; }")).toEqual(["type-mismatch"]);
  });

  test("an absolute path starts with a slash", () => {
    expect(codes('{ files.root = "/etc/x"; }')).toEqual([]);
    expect(codes("{ files.root = ./x; }")).toEqual([]);
    expect(codes('{ files.root = "${x}/y"; }')).toEqual([]);
    expect(codes('{ files.root = "x"; }')).toEqual(["type-mismatch"]);
    expect(codes("{ files.root = 5; }")).toEqual(["type-mismatch"]);
    expect(codes('{ files.either = "/a"; }')).toEqual([]);
    expect(codes('{ files.either = "a"; }')).toEqual(["type-mismatch"]);
    expect(codes("{ files.either = 3; }")).toEqual([]);
  });

  test("an alternative that is a list keeps the kind of its elements", () => {
    expect(codes('{ mixed.text = "a"; }')).toEqual([]);
    expect(codes('{ mixed.text = [ "a" "b" ]; }')).toEqual([]);
    expect(codes("{ mixed.text = [ 1 ]; }")).toEqual(["type-mismatch"]);
    expect(codes("{ mixed.text = 5; }")).toEqual(["type-mismatch"]);
    expect(codes("{ x, ... }: { mixed.text = [ x ]; }")).toEqual([]);
    expect(codes("{ mixed.text = lib.concatLists [ ]; }")).toEqual([]);
  });

  test("an alternative that is a fixed string keeps its values", () => {
    expect(codes("{ mixed.jobs = 4; }")).toEqual([]);
    expect(codes('{ mixed.jobs = "auto"; }')).toEqual([]);
    expect(codes('{ mixed.jobs = "many"; }')).toEqual(["type-mismatch"]);
    expect(codes('{ mixed.jobs = "${x}"; }')).toEqual([]);
    expect(codes("{ mixed.jobs = [ ]; }")).toEqual(["type-mismatch"]);
  });

  test("a list says which of its elements are of a kind the option does not take", () => {
    const [d] = run('{ networking.firewall.allowedTCPPorts = [ 22 "80" true "x" ]; }').diagnostics;
    expect(d?.params.got).toBe("list with str and bool elements");
    const [plain] = run("{ networking.firewall.allowedTCPPorts = 5; }").diagnostics;
    expect(plain?.params.got).toBe("int");
  });

  test("checks the elements of a list and the kinds a mix takes", () => {
    expect(codes("{ networking.firewall.allowedTCPPorts = [ 22 80 ]; }")).toEqual([]);
    expect(codes('{ networking.firewall.allowedTCPPorts = [ "ssh" ]; }')).toEqual([
      "type-mismatch",
    ]);
    expect(codes("{ x, ... }: { networking.firewall.allowedTCPPorts = [ x 22 ]; }")).toEqual([]);
    expect(codes("{ mixed.value = 5; }")).toEqual([]);
    expect(codes("{ mixed.value = [ ]; }")).toEqual(["type-mismatch"]);
  });

  test("a type that may be an attribute set takes any key below it", () => {
    expect(codes('{ mixed.free = "a"; mixed.free.k = 1; }')).toEqual([]);
    expect(codes("{ mixed.free = [ ]; }")).toEqual(["type-mismatch"]);
  });

  test("the values of an attribute set of something are checked one level down", () => {
    expect(codes('{ env.vars.A = "x"; env.vars.B = 5; }')).toEqual([]);
    expect(codes("{ env.vars.A = [ ]; }")).toEqual(["type-mismatch"]);
    expect(codes("{ env.vars = { A = true; B = 1; }; }")).toEqual(["type-mismatch"]);
    expect(codes("{ x, ... }: { env.vars.A = x; }")).toEqual([]);
    // Deeper than the values themselves there is nothing to read.
    expect(codes("{ env.vars.A.b = [ ]; }")).toEqual([]);
  });
});

describe("values narrowed by more than their kind", () => {
  const got = (src: string) => run(src).diagnostics.map((d) => d.params.expected ?? d.code);

  test("a list of paths takes absolute paths, and what is not written out", () => {
    expect(got('{ files.list = [ "/etc/x" ./y ]; }')).toEqual([]);
    expect(got('{ files.list = [ "x" ]; }')).toEqual(["list of path"]);
    expect(got('{ x, ... }: { files.list = [ "${x}/a" x ]; }')).toEqual([]);
  });

  test("a function is anything that is not written out as another kind", () => {
    expect(got("{ x, ... }: { mixed.overlays = [ (final: prev: { }) x ./o.nix ]; }")).toEqual([]);
    expect(got('{ mixed.overlays = [ "x" 1 ]; }')).toEqual(["list of function"]);
    expect(got("{ mixed.hook = 5; }")).toEqual(["function"]);
    expect(got("{ mixed.hook = a: a; }")).toEqual([]);
  });

  test("the elements of a list can be held to an enum", () => {
    expect(got('{ mixed.shells = [ "bash" "zsh+fzf" ]; }')).toEqual([]);
    expect(got('{ x, ... }: { mixed.shells = [ "${x}" x ]; }')).toEqual([]);
    expect(got('{ mixed.shells = [ "fish" ]; }')).toEqual(["list of enum(bash | zsh+fzf)"]);
  });

  test("a pattern too long for a sentence is not written into it", () => {
    expect(got('{ mixed.long = "x"; }')).toEqual(["string matching its pattern"]);
  });

  test("a string with a pattern has to match it, and says which", () => {
    expect(got('{ units.name = "a.service"; }')).toEqual([]);
    expect(got('{ units.name = "a"; }')).toEqual(["string matching ^[a-z]+[.]service$"]);
    expect(got('{ x, ... }: { units.name = "${x}.service"; }')).toEqual([]);
    expect(got("{ units.name = 5; }")).toEqual(["string matching ^[a-z]+[.]service$"]);
  });

  test("the elements of a list are held to the pattern, and a mix takes either kind", () => {
    expect(got('{ units.after = [ "a.service" "b.socket" ]; }')).toEqual([]);
    expect(got('{ units.after = [ "a" ]; }')).toEqual([
      "list of string matching [a-z]+[.](service|socket)",
    ]);
    expect(got("{ units.either = 5; }")).toEqual([]);
    expect(got('{ units.either = "12"; }')).toEqual([]);
    expect(got('{ units.either = "x"; }')).toEqual(["int | string matching [[:digit:]]+"]);
  });
});

describe("renamed options", () => {
  test("a value is held to the type of the option it was renamed to", () => {
    const diagnostics = run('{ services.xserver.displayManager.gdm.enable = "yes"; }').diagnostics;
    expect(diagnostics.map((d) => d.code).sort()).toEqual(["deprecated", "type-mismatch"]);
    expect(codes("{ services.xserver.displayManager.gdm.enable = true; }")).toEqual(["deprecated"]);
  });

  test("through the renames of renames, and not past what cannot be followed", () => {
    expect(codes('{ mixed.old = "yes"; }').sort()).toEqual(["deprecated", "type-mismatch"]);
    expect(codes("{ mixed.old = true; }")).toEqual(["deprecated"]);
    // The new name is not in the catalog, or the renames go round: the value is not judged.
    expect(codes("{ mixed.lost = 5; }")).toEqual(["deprecated"]);
    expect(codes("{ mixed.loop = 5; }")).toEqual(["deprecated"]);
    // A key of an `attrsOf` is held to what its values may be; a free-form place judges nothing.
    expect(codes("{ mixed.viaEnv = [ ]; }").sort()).toEqual(["deprecated", "type-mismatch"]);
    expect(codes('{ mixed.viaEnv = "x"; }')).toEqual(["deprecated"]);
    expect(codes("{ mixed.viaNowhere = 5; }")).toEqual(["deprecated"]);
  });
});
