// Puts nix.conf lines to the real Nix (`nix config show` reads the file the way `nix` does) and to our
// validator, and fails when they disagree about unknown settings and wrong values. One setting per file:
// Nix stops at the first line it rejects. Every setting of the catalog is tried with a good value and a
// bad one, plus a few written by hand for the words that depend on the setting (`auto`, `relaxed`, `1`).
//   bun tools/oracle/nix-conf.ts   (needs Nix; run by `devenv shell -- oracle`)
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OptionRow } from "../../src/lib/catalog/types";
import { checkText } from "../../src/lib/check-text";

const catalogDir = join(import.meta.dir, "..", "..", "public", "catalog", "nix-conf");
const fromDisk = (async (url: string) => {
  const file = Bun.file(join(catalogDir, "..", String(url).replace(/^\/catalog\//, "")));
  return (await file.exists())
    ? Response.json(await file.json())
    : new Response("no", { status: 404 });
}) as unknown as typeof fetch;

type Verdict = "ok" | "unknown" | "type";

async function real(dir: string, text: string): Promise<Verdict> {
  await Bun.write(join(dir, "nix.conf"), text);
  const proc = Bun.spawn(
    ["nix", "config", "show", "--extra-experimental-features", "nix-command"],
    {
      env: { ...process.env, NIX_CONF_DIR: dir },
      stdout: "ignore",
      stderr: "pipe",
    },
  );
  const err = await new Response(proc.stderr).text();
  await proc.exited;
  if (/unknown setting/.test(err)) return "unknown";
  return /error:/.test(err) ? "type" : "ok";
}

async function ours(text: string): Promise<Verdict> {
  const { report } = await checkText(text, "nix-conf", "unstable", "/", fromDisk);
  const codes = report.diagnostics.map((d) => d.code);
  if (codes.includes("unknown-option")) return "unknown";
  return codes.some((c) => c === "type-mismatch" || c === "conf-bad-line") ? "type" : "ok";
}

const index = (await Bun.file(join(catalogDir, "index.json")).json()) as { keys: string[] };
// What Nix itself accepts for a setting is its default, written as a line: a text or a list may only take
// values that mean something (a store URL, a path, a word from a short list), so `a b` is not a good one.
const shown = Bun.spawn(
  ["nix", "config", "show", "--json", "--extra-experimental-features", "nix-command"],
  { stdout: "pipe" },
);
const defaults = JSON.parse(await new Response(shown.stdout).text()) as Record<
  string,
  { defaultValue: unknown; aliases: string[] }
>;
const goodValue = new Map<string, string>();
for (const [name, { defaultValue, aliases }] of Object.entries(defaults)) {
  const text = Array.isArray(defaultValue) ? defaultValue.join(" ") : defaultValue;
  if (typeof text !== "string") continue;
  for (const path of [name, ...aliases]) goodValue.set(path, text);
}

// Booleans Nix reads only when it uses them, so it accepts any word in the file and fails later. We say it is
// wrong at once, which is the better answer: they are not tried with a bad value.
const NOT_READ_YET = new Set([
  "accept-flake-config",
  "allow-dirty-locks",
  "auto-allocate-uids",
  "use-registries",
]);

const rows: OptionRow[] = [];
for (const key of index.keys)
  rows.push(...((await Bun.file(join(catalogDir, `${key}.json`)).json()) as OptionRow[]));

const cases: Array<[string, Verdict]> = [
  ["max-jobs = auto", "ok"],
  ["max-jobs = 8", "ok"],
  ["max-jobs = lots", "type"],
  ["sandbox = relaxed", "ok"],
  ["sandbox = true", "ok"],
  ["sandbox = sometimes", "type"],
  ["keep-going = yes", "ok"],
  ["keep-going = 1", "ok"],
  ["cores = 0", "ok"],
  ["min-free = 128M", "ok"],
  ["experimental-features = flakes", "ok"],
  ["experimental-features = nix-command flakes", "ok"],
  ["extra-experimental-features = flakes", "ok"],
  ["substituters = https://cache.nixos.org https://a.example", "ok"],
  ["trusted-users = root @wheel", "ok"],
  ["builders = ssh://a x86_64-linux", "ok"],
  ["keep-going=true", "type"],
  ["keep-going true", "type"],
  ["experimental-featurs = flakes", "unknown"],
  ["extra-experimental-featurs = flakes", "unknown"],
];
for (const [path, type] of rows) {
  if (type === "bool") {
    cases.push([`${path} = true`, "ok"]);
    if (!NOT_READ_YET.has(path)) cases.push([`${path} = maybe`, "type"]);
  }
  if (type === "int") cases.push([`${path} = 3`, "ok"], [`${path} = abc`, "type"]);
  const good = goodValue.get(path.replace(/^extra-/, ""));
  // `max-jobs` and `sandbox` have words of their own, and `external-builders` is JSON: tried by hand above.
  const own = /^(build-)?(max-jobs|use-sandbox)$|^(extra-)?external-builders$/.test(path);
  if (type === "mix" && good !== undefined && !own) {
    cases.push([`${path} = ${good}`.trimEnd(), "ok"]);
  }
  cases.push([`${path}-typo = 1`, "unknown"]);
}

const dir = await mkdtemp(join(tmpdir(), "nixchecker-nixconf-"));
const problems: string[] = [];
let next = 0;
await Promise.all(
  Array.from({ length: 8 }, async (_, worker) => {
    const own = join(dir, String(worker));
    await Bun.$`mkdir -p ${own}`;
    for (let i = next++; i < cases.length; i = next++) {
      const [text, expected] = cases[i] as [string, Verdict];
      const [nix, us] = await Promise.all([real(own, `${text}\n`), ours(`${text}\n`)]);
      if (nix !== us) problems.push(`  nix says ${nix}, we say ${us}: ${text}`);
      else if (nix !== expected)
        problems.push(`  not what was expected (${expected}, both say ${nix}): ${text}`);
    }
  }),
);
await rm(dir, { recursive: true });
console.log(`nix.conf: ${cases.length} lines, ${problems.length} disagreements`);
if (problems.length > 0) {
  console.error(problems.sort().join("\n"));
  process.exit(1);
}
