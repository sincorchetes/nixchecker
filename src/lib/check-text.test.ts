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

  test("a nix.conf is read as one when it is chosen, and when it can only be one", async () => {
    const text = "experimental-features = nix-command flakes\ncores = abc\nkeep-goin = true\n";
    for (const choice of ["nix-conf", "auto"] as const) {
      const { report, source } = await run(text, choice);
      expect(report.target).toBe("nix-conf");
      expect(source).toContain("nix.conf");
      expect(report.diagnostics.map((d) => [d.code, d.line, d.suggestion ?? null])).toEqual([
        ["type-mismatch", 2, null],
        ["unknown-option", 3, "keep-going"],
      ]);
    }
    expect((await run("{ cores = 4; }")).report.target).not.toBe("nix-conf");
  });

  test("a line of a nix.conf that is not a setting is a syntax error, and the rest is still checked", async () => {
    const { report } = await run("cores=4\nkeep-going = true\n", "nix-conf");
    expect(report.diagnostics.map((d) => [d.code, d.line])).toEqual([["conf-bad-line", 1]]);
  });

  test("the options of sops-nix, agenix and impermanence are known and typed on top of NixOS", async () => {
    const text = [
      "sops.defaultSopsFile = ./secrets.yaml;",
      'sops.secrets."db/password".owner = "postgres";',
      'sops.secrets."db/password".mode = 0400;',
      "age.secrets.token.file = ./token.age;",
      'environment.persistence."/persist".directories = [ "/var/lib" ];',
      "sops.age.keyFile = true;",
      "sops.secret.x = 1;",
      "services.openssh.enable = true;",
    ].join("\n");
    const { report, source } = await run(`{\n${text}\n}`, "nixos");
    expect(source).toMatch(/nixpkgs.* \+ sops-nix .* \+ agenix .* \+ impermanence/);
    expect(report.diagnostics.map((d) => [d.code, d.line, d.suggestion ?? null])).toEqual([
      // `mode` is text ('"0400"'), not a number.
      ["type-mismatch", 4, null],
      ["unknown-option", 8, "sops.secrets.x"],
    ]);
    expect(report.diagnostics[0]?.docUrl).toContain("sops-nix");
  });

  test("the Home Manager module of sops-nix is added to Home Manager, not to NixOS", async () => {
    const { report, source } = await run(
      '{ home.stateVersion = "24.11"; sops.age.generateKey = "yes"; }',
      "home-manager",
    );
    expect(source).toContain("home-manager 26.05");
    expect(source).toContain("+ sops-nix");
    expect(report.diagnostics.map((d) => [d.code, d.params.path])).toEqual([
      ["type-mismatch", "sops.age.generateKey"],
    ]);
    expect(report.diagnostics[0]?.docUrl).toContain("sops-nix#home-manager");
  });

  test("a text that uses sops-nix is NixOS for the page, not Home Manager", async () => {
    const { report } = await run("{ sops.secrets.x = { }; services.openssh.enable = true; }");
    expect(report.target).toBe("nixos");
    expect(report.diagnostics).toEqual([]);
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
