import { describe, expect, test } from "bun:test";
import { checkText } from "./check-text";

// Serves the generated catalogs from disk, to run the real loader against them.
const dir = `${import.meta.dir}/../../public/catalog`;
const disk = (async (url: string) => {
  const file = Bun.file(`${dir}/${url.replace(/^\/catalog\//, "")}`);
  return (await file.exists())
    ? Response.json(await file.json())
    : new Response("no", { status: 404 });
}) as unknown as typeof fetch;

const run = (text: string, choice: Parameters<typeof checkText>[1] = "auto") =>
  checkText(text, choice, "26.05", "/", disk);

describe("checkText", () => {
  test("holds a text against the target it was told", async () => {
    const { report, source, tree } = await run("{ networking.hostName = 5; }", "nixos");
    expect(report.target).toBe("nixos");
    expect(report.diagnostics.map((d) => d.code)).toEqual(["type-mismatch"]);
    expect(source).toContain("nixpkgs");
    expect(tree.kids.has("networking")).toBe(true);
  });

  test("a text that says what it is is held against that", async () => {
    expect((await run("{ home.packages = [ ]; }")).report.target).toBe("home-manager");
    expect((await run('{ description = "x"; outputs = _: { }; }')).report.target).toBe("flake");
  });

  test("a text that could be NixOS or Home Manager goes to the one with fewer errors", async () => {
    // `programs.git.userEmail` is Home Manager's; NixOS has no such option.
    expect((await run('{ programs.git.userEmail = "a@b.c"; }')).report.target).toBe("home-manager");
    expect((await run("{ programs.git.enable = true; }")).report.target).toBe("nixos");
  });

  test("an unreachable catalog is an error, not an empty answer", async () => {
    const down = (async () => new Response("down", { status: 503 })) as unknown as typeof fetch;
    await expect(checkText("{ a = 1; }", "nixos", "26.05", "/", down)).rejects.toThrow();
  });
});

describe("checkText on a renamed option", () => {
  const codes = async (text: string) =>
    (await run(text, "nixos")).report.diagnostics.map((d) => d.code).sort();

  test("holds the value to the type of the option it was renamed to, in another part of the catalog", async () => {
    // `security` and `users` are different shards, and the new name has a `*` where the old one has `root`.
    expect(await codes("{ security.initialRootPassword = 5; }")).toEqual([
      "deprecated",
      "type-mismatch",
    ]);
    expect(await codes('{ security.initialRootPassword = "!"; }')).toEqual(["deprecated"]);
  });
});

describe("checkText on a file that is no module", () => {
  const lib = "{ toXmlAttrs = 1; mkXmlAttr = 2; }";

  test("one warning when the kind was guessed, errors when it was chosen", async () => {
    expect((await run(lib)).report.diagnostics.map((d) => d.code)).toEqual(["not-a-module"]);
    expect((await run(lib, "nixos")).report.diagnostics.map((d) => d.code)).toEqual([
      "unknown-option",
      "unknown-option",
    ]);
  });
});
