import { describe, expect, test } from "bun:test";
import { convert } from "./convert";

const typeOf = (entries: ReturnType<typeof convert>, path: string) =>
  entries.find((e) => e.path === path)?.type;

describe("convert with a chain of renames", () => {
  // `a` became `b`, which became `c`; the manuals document only `c`. The order the sources were read in
  // differs between machines, and the catalog must not.
  const documented = { "c.opt": { type: "boolean" } };
  const chain: Record<string, string> = { "a.opt": "b.opt", "b.opt": "c.opt" };

  test("every link takes the type at the end of the chain, in any order", () => {
    const forward = convert(documented, ["a.opt", "b.opt"], { renamed: chain });
    const backward = convert(documented, ["a.opt", "b.opt"], {
      renamed: Object.fromEntries(Object.entries(chain).reverse()),
    });
    expect(forward).toEqual(backward);
    expect(typeOf(forward, "a.opt")).toBe("bool");
    expect(typeOf(forward, "b.opt")).toBe("bool");
  });

  test("a chain that ends at an option nobody documents is any", () => {
    const rooted = convert({ "a.other": { type: "boolean" } }, [], {
      renamed: { "a.opt": "a.mid", "a.mid": "a.end" },
    });
    expect(typeOf(rooted, "a.opt")).toBe("any");
    expect(typeOf(rooted, "a.mid")).toBe("any");
  });

  test("a cycle of renames ends instead of looping", () => {
    const entries = convert({ "a.other": { type: "boolean" } }, [], {
      renamed: { "a.one": "a.two", "a.two": "a.one" },
    });
    expect(entries.map((e) => e.path)).toEqual(["a.one", "a.other", "a.two"]);
  });
});
