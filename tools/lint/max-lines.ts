// Fails when a source file is longer than MAX_LINES: past that, a file is almost always doing
// more than one job. Split it by responsibility instead of raising the limit.
//   bun tools/lint/max-lines.ts      (run by `devenv shell -- lint`)
import { join } from "node:path";

const MAX_LINES = 250;
const root = join(import.meta.dir, "..", "..");

const tooLong: string[] = [];
let files = 0;
for (const dir of ["src", "tools", "e2e"]) {
  const glob = new Bun.Glob("**/*.{ts,astro,css}");
  for await (const file of glob.scan({ cwd: join(root, dir) })) {
    files++;
    const lines = (await Bun.file(join(root, dir, file)).text()).split("\n").length - 1;
    if (lines > MAX_LINES) tooLong.push(`  ${dir}/${file}: ${lines} lines`);
  }
}

if (tooLong.length > 0) {
  console.error(`Files longer than ${MAX_LINES} lines:\n${tooLong.join("\n")}`);
  process.exit(1);
}
console.log(`Checked ${files} files: none longer than ${MAX_LINES} lines.`);
