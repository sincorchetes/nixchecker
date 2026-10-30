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
