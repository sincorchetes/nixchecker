import { describe, expect, test } from "bun:test";
import { contextAt } from "./context";

// `|` marks the cursor.
const at = (marked: string) => contextAt(marked.replace("|", ""), marked.indexOf("|"));

describe("completion context", () => {
  test("a name at the start of a statement, written so far", () => {
    expect(at("{ services.openssh.ena| }")).toEqual({
      enclosing: [],
      written: ["services", "openssh"],
      partial: "ena",
    });
    expect(at("{\n  net|\n}")).toEqual({ enclosing: [], written: [], partial: "net" });
    expect(at("{ a = 1; b.| }")).toEqual({ enclosing: [], written: ["b"], partial: "" });
  });

  test("below the options an enclosing set belongs to", () => {
    expect(at("{ services.openssh = { ena| }; }")).toEqual({
      enclosing: ["services", "openssh"],
      written: [],
      partial: "ena",
    });
    expect(at('{ users.users."a.b" = { x = { y| }; }; }')?.enclosing).toEqual([
      "users",
      "users",
      "a.b",
      "x",
    ]);
  });

  test("a closed set is left behind, and the module's own braces are the root", () => {
    expect(at("{ a = { b = 1; }; c| }")).toEqual({ enclosing: [], written: [], partial: "c" });
    expect(at("{ config, pkgs, ... }:\n{\n  ser|\n}")?.enclosing).toEqual([]);
    expect(at("let x = 1; in {\n  ser|\n}")?.enclosing).toEqual([]);
  });

  test("comments before the cursor do not hide it", () => {
    expect(at("{\n  # the network\n  net|\n}")).toMatchObject({ partial: "net" });
  });

  test("nothing is offered in a value, a string, a comment or an argument list", () => {
    expect(at("{ a = foo.ba| }")).toBeUndefined();
    expect(at('{ a = "services.o| }')).toBeUndefined();
    expect(at("{ # services.o|\n}")).toBeUndefined();
    expect(at("{ config, pk| }: { }")).toBeUndefined();
  });

  test("nothing is offered inside a set that is not an option's", () => {
    expect(at("{ a = [ { b| } ]; }")).toBeUndefined();
    expect(at("{ a = lib.mkIf x { b| }; }")).toBeUndefined();
    expect(at('{ a = "}"; b| }')).toEqual({ enclosing: [], written: [], partial: "b" });
  });
});
