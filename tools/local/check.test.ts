import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const script = join(import.meta.dir, "check.ts");
const dir = await Bun.$`mktemp -d`.text().then((t) => t.trim());
await Bun.write(join(dir, "good.nix"), '{ networking.hostName = "box"; }\n');
await Bun.write(join(dir, "bad.nix"), "{ networking.hostName = 5; }\n");
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
    expect(json.evaluated).toBe(false);
    expect(json.items[0].severity).toBe("error");
  });

  test("a syntax error is reported and nothing is evaluated", async () => {
    const r = await run(join(dir, "broken.nix"), "--target", "nixos", "--json");
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).evaluated).toBe(false);
  });

  test("usage errors exit 2", async () => {
    expect((await run("--static")).code).toBe(2);
    expect((await run(join(dir, "good.nix"), join(dir, "bad.nix"))).code).toBe(2);
  });
});
