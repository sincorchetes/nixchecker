import { describe, expect, test } from "bun:test";
import { ancestors, splitPath } from "./path";

describe("option paths", () => {
  test("a name between quotes keeps its dots", () => {
    expect(splitPath('boot.kernel.sysctl."net.core.rmem_max"')).toEqual([
      "boot",
      "kernel",
      "sysctl",
      "net.core.rmem_max",
    ]);
    expect(splitPath("services.openssh.enable")).toEqual(["services", "openssh", "enable"]);
  });

  test("an escaped quote does not end the name", () => {
    expect(splitPath('a."b\\".c".d')).toEqual(["a", 'b".c', "d"]);
  });

  test("the paths above one are written as they are", () => {
    expect(ancestors('a."b.c".d')).toEqual(["a", 'a."b.c"']);
    expect(ancestors("a")).toEqual([]);
    expect(ancestors("a.b")).toEqual(["a"]);
  });
});
