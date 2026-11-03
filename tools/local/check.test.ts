import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { problemsWith } from "./sarif-schema";

const script = join(import.meta.dir, "check.ts");
const dir = await Bun.$`mktemp -d`.text().then((t) => t.trim());
await Bun.write(join(dir, "good.nix"), '{ networking.hostName = "box"; }\n');
await Bun.write(join(dir, "bad.nix"), "{ networking.hostName = 5; }\n");
await Bun.write(join(dir, "hm.nix"), '{ programs.git.userEmail = "a@b.c"; }\n');
await Bun.write(join(dir, "broken.nix"), "{ networking.hostName = ; }\n");

async function run(...args: string[]) {
  const p = Bun.spawn(["bun", script, ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
  ]);
  return { code: await p.exited, out, err };
}

describe("evaluate CLI (static layer)", () => {
  test("a valid file exits 0", async () => {
    const r = await run(join(dir, "good.nix"), "--static", "--target", "nixos");
    expect(r.code).toBe(0);
    expect(r.out).toContain("0 errors");
  });

  test("a wrong type exits 1 and says where", async () => {
    const r = await run(join(dir, "bad.nix"), "--static", "--target", "nixos");
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/error\s+1:/);
  });

  test("options and the file may come in any order", async () => {
    const a = await run("--static", join(dir, "bad.nix"), "--target", "nixos");
    const b = await run("--target", "nixos", "--static", join(dir, "bad.nix"));
    const c = await run(join(dir, "bad.nix"), "--target", "nixos", "--static");
    expect([a.code, b.code]).toEqual([1, 1]);
    expect(a.out).toBe(c.out);
    expect(b.out).toBe(c.out);
  });

  test("--json prints the items", async () => {
    const r = await run("--json", "--static", join(dir, "bad.nix"), "--target", "nixos");
    const json = JSON.parse(r.out);
    expect(json.schemaVersion).toBe(1);
    expect(json.results[0].evaluated).toBe(false);
    expect(json.results[0].items[0].severity).toBe("error");
  });

  test("a syntax error is reported and nothing is evaluated", async () => {
    const r = await run(join(dir, "broken.nix"), "--target", "nixos", "--json");
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).results[0].evaluated).toBe(false);
  });

  test("usage errors exit 2", async () => {
    expect((await run("--static")).code).toBe(2);
  });
});

describe("evaluate CLI (several files)", () => {
  test("a directory is searched and each file is named", async () => {
    const r = await run(dir, "--static", "--target", "nixos");
    expect(r.code).toBe(1);
    expect(r.out).toContain(`== ${join(dir, "bad.nix")}`);
    expect(r.out).toContain(`== ${join(dir, "good.nix")}`);
  });

  test("several files print a list in JSON", async () => {
    const r = await run(join(dir, "good.nix"), join(dir, "bad.nix"), "--static", "--json");
    expect(JSON.parse(r.out).results.map((x: { file: string }) => x.file)).toEqual([
      join(dir, "good.nix"),
      join(dir, "bad.nix"),
    ]);
  });

  test("a directory without Nix files is an error", async () => {
    const empty = await Bun.$`mktemp -d`.text().then((t) => t.trim());
    const r = await run(empty);
    expect(r.code).toBe(2);
    expect(r.err).toContain("no .nix files");
  });
});

describe("evaluate CLI (formats)", () => {
  test("JSON carries the coverage and where the catalog comes from", async () => {
    const r = await run("--format", "json", "--static", join(dir, "bad.nix"), "--target", "nixos");
    const [json] = JSON.parse(r.out).results;
    expect(json.coverage).toEqual({ checked: 1, total: 1 });
    expect(json.catalog.name).toMatch(/^nixos-/);
    expect(json.catalog.source).toContain("nixpkgs");
    expect(Object.keys(json.catalog.revisions).length).toBeGreaterThan(0);
  });

  test("SARIF places each finding in its file, line and column", async () => {
    const r = await run("--format", "sarif", "--static", join(dir, "bad.nix"), "--target", "nixos");
    const sarif = JSON.parse(r.out);
    expect(problemsWith(sarif)).toEqual([]);
    expect(sarif.version).toBe("2.1.0");
    const [result] = sarif.runs[0].results;
    expect(result).toMatchObject({ ruleId: "type-mismatch", level: "error" });
    expect(result.locations[0].physicalLocation).toMatchObject({
      artifactLocation: { uri: join(dir, "bad.nix") },
      region: { startLine: 1, startColumn: 3 },
    });
    expect(r.code).toBe(1);
  });

  test("an unknown format is a usage error", async () => {
    expect((await run("--format", "xml", join(dir, "good.nix"))).code).toBe(2);
  });
});

describe("evaluate CLI (target)", () => {
  test("a file that could be NixOS or Home Manager goes where it has fewer errors, as on the page", async () => {
    const r = await run("--format", "json", "--static", join(dir, "hm.nix"));
    expect(JSON.parse(r.out).results[0].target).toBe("home-manager");
    expect(r.code).toBe(0);
  });
});

describe("evaluate CLI (help and mistakes)", () => {
  test("--help and --version print and exit 0", async () => {
    const help = await run("--help");
    expect(help.code).toBe(0);
    expect(help.out).toContain("Usage: nixchecker");
    const version = await run("--version");
    expect(version.code).toBe(0);
    expect(version.out).toMatch(/^nixchecker \d+\.\d+\.\d+/);
  });

  test("a mistake is one line and a hint, never a stack", async () => {
    const r = await run("--bogus", join(dir, "good.nix"));
    expect(r.code).toBe(2);
    expect(r.err).toContain("nixchecker: ");
    expect(r.err).toContain("Try 'nixchecker --help'");
    expect(r.err).not.toContain("at ");
    expect((await run("--release", "9.9", join(dir, "good.nix"))).code).toBe(2);
  });

  test("several files at once give the same answer, in the same order", async () => {
    const files = [join(dir, "good.nix"), join(dir, "bad.nix"), join(dir, "hm.nix")];
    const one = await run("--static", "--jobs", "1", "--format", "json", ...files);
    const many = await run("--static", "--jobs", "3", "--format", "json", ...files);
    expect(many.out).toBe(one.out);
  });
});
