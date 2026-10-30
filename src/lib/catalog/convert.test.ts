import { describe, expect, test } from "bun:test";
import { convert, mapType } from "./convert";
import { extractRenames } from "./renames";
import { opt } from "./types";

describe("mapType", () => {
  const type = (description: string) => mapType(description).type;

  test("maps scalar types", () => {
    expect(type("boolean")).toBe("bool");
    expect(type("null or boolean")).toBe("bool");
    expect(type("signed integer")).toBe("int");
    expect(type("16 bit unsigned integer; between 0 and 65535 (both inclusive)")).toBe("int");
    expect(type("null or absolute path")).toBe("str");
    expect(type('strings concatenated with "\\n"')).toBe("str");
    expect(type("null or (An absolute path)")).toBe("str");
  });

  test("reads a list before the type of its elements", () => {
    expect(type("list of 16 bit unsigned integer; between 0 and 65535 (both inclusive)")).toBe(
      "list",
    );
    expect(type("non-empty list of string")).toBe("list");
    expect(type("null or (list of string)")).toBe("list");
  });

  test("tells strict, free-form and open sets apart", () => {
    expect(type("attribute set of (submodule)")).toBe("container");
    expect(type("attribute set of signed integer")).toBe("container");
    expect(type("TOML value")).toBe("container");
    expect(type("open submodule of (JSON value)")).toBe("attrs");
    expect(type("DAG of open submodule of attribute set of anything")).toBe("attrs");
    expect(type("attribute set of (open submodule of (JSON value))")).toBe("attrs");
    expect(type("attribute set of (submodule)")).toBe("container");
  });

  test("parses enums, including numeric and boolean ones", () => {
    expect(mapType('one of "a", "b"')).toEqual({ type: "enum", values: ["a", "b"] });
    expect(mapType("null or (one of x,y)")).toEqual({ type: "enum", values: ["x", "y"] });
    expect(type("one of 1, 2, 3")).toBe("int");
    expect(type("one of true, false")).toBe("bool");
  });

  test("does not guess for alternatives or unknown types", () => {
    expect(type("string or package")).toBe("any");
    expect(type("package")).toBe("any");
    expect(type("nixpkgs config")).toBe("any");
    expect(type("(a) or (b)")).toBe("any");
  });
});

describe("convert", () => {
  test("normalizes names and turns listed containers into strict sets", () => {
    const entries = convert({
      "users.users": { type: "attribute set of (submodule)" },
      "users.users.<name>.isNormalUser": { type: "boolean" },
      "environment.variables": { type: "attribute set of string" },
      "nix.settings": { type: "open submodule of (nix atom)" },
      "nix.settings.sandbox": { type: "boolean" },
    });
    expect(entries.map((e) => [e.path, e.type])).toEqual([
      ["environment.variables", "attrs"],
      ["nix.settings", "attrs"],
      ["nix.settings.sandbox", "bool"],
      ["users.users", "set"],
      ["users.users.*.isNormalUser", "bool"],
    ]);
  });

  test("adds hidden options without overriding documented ones", () => {
    const entries = convert({ "a.b": { type: "boolean" } }, ["a.b", "a.old", "a.<name>.x"]);
    expect(entries.map((e) => [e.path, e.type])).toEqual([
      ["a.*.x", "hidden"],
      ["a.b", "bool"],
      ["a.old", "hidden"],
    ]);
  });

  test("applies renames and entry overrides from the overlay", () => {
    const entries = convert(
      {
        "new.opt": { type: "boolean" },
        "keep.me": { type: "string" },
        "old.root": { type: "boolean" },
      },
      [],
      {
        renamed: { "old.opt": "new.opt", "old.gone": "missing.opt" },
        entries: [opt("keep.me", "int"), opt("extra", "list")],
      },
    );
    expect(entries).toEqual([
      { path: "extra", type: "list" },
      { path: "keep.me", type: "int" },
      { path: "new.opt", type: "bool" },
      { path: "old.gone", type: "any", renamedTo: "missing.opt" },
      { path: "old.opt", type: "bool", renamedTo: "new.opt" },
      { path: "old.root", type: "bool" },
    ]);
  });

  test("an overlay entry cancels the container promotion", () => {
    const entries = convert(
      { "a.c": { type: "attribute set of string" }, "a.c.d": { type: "string" } },
      [],
      {
        entries: [opt("a.c", "attrs")],
      },
    );
    expect(entries.find((e) => e.path === "a.c")?.type).toBe("attrs");
  });
});

describe("convert names", () => {
  test("a name the manuals quoted is written plainly", () => {
    const entries = convert({ 'a."passdb pam".<name>.b': { type: "string" } });
    expect(entries.map((e) => e.path)).toEqual(["a.passdb pam.*.b"]);
  });
});

describe("convert with shapes", () => {
  test("the real type from Nix wins over the sentence of the manuals", () => {
    const options = {
      "a.b": { type: "string" },
      "a.c": { type: "string" },
      "g.<name>": { type: "attribute set of (submodule)" },
      "g.<name>.x": { type: "boolean" },
    };
    const shapes = { "a.b": ["s", "i"], "g.<name>": ["a"], "a.c": ["?"] } as const;
    const entries = convert(options, [], {}, structuredClone(shapes) as never);
    const byPath = Object.fromEntries(entries.map((e) => [e.path, e]));
    expect(byPath["a.b"]).toMatchObject({ type: "mix", values: ["str", "int"] });
    // Nothing to read in the shape: back to the sentence.
    expect(byPath["a.c"]?.type).toBe("str");
    // Only "an attribute set": the sentence says whether it is strict or free-form.
    expect(byPath["g.*"]?.type).toBe("set");
    expect(byPath["g.*.x"]?.type).toBe("bool");
  });
});

describe("extractRenames", () => {
  test("reads static renames in every form, and skips the rest", () => {
    const source = `
      (mkRenamedOptionModule [ "services" "foo" "enable" ] [ "services" "bar" "enable" ])
      (lib.mkRenamedOptionModule
        [ "a" "b" ]
        [ "c" "d" ])
      (mkRenamedOptionModuleWith {
        sinceRelease = 2505;
        from = [ "x" "y" ];
        to = [ "z" ];
      })
      (mkRenamedOptionModule [ "p" opt ] [ "q" ])
      (mkRenamedOptionModule [ "p" "\${name}" ] [ "q" ])
      (mkRenamedOptionModule [ "same" ] [ "same" ])
    `;
    expect(extractRenames(source)).toEqual({
      "services.foo.enable": "services.bar.enable",
      "a.b": "c.d",
      "x.y": "z",
    });
    expect(extractRenames("nothing here")).toEqual({});
  });

  test("convert never lets a rename shadow a documented option or its parent", () => {
    const entries = convert(
      { "new.opt": { type: "boolean" }, "kept.child": { type: "boolean" } },
      ["old.opt"],
      {
        renamed: {
          "old.opt": "new.opt",
          "new.opt": "x",
          kept: "y",
          "new.gone": "new.opt",
          "gone.opt": "new.opt",
        },
      },
    );
    const byPath = Object.fromEntries(entries.map((e) => [e.path, e]));
    expect(byPath["old.opt"]).toMatchObject({ type: "bool", renamedTo: "new.opt" });
    expect(byPath["new.gone"]).toMatchObject({ renamedTo: "new.opt" });
    expect(byPath["gone.opt"]).toBeUndefined();
    expect(byPath["new.opt"]?.renamedTo).toBeUndefined();
    expect(byPath.kept?.renamedTo).toBeUndefined();
  });
});
