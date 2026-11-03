// Checks Nix files or flakes in two layers: the static analysis of the page, and the real module system
// of the Nix on this machine, which settles what the analysis can only guess (imports, mkIf, merging,
// priorities, assertions). Directories are searched for .nix files. `--help` says how.
import { checkFile } from "./check-file";
import { HELP, parseCommand, UsageError } from "./cli-args";
import { nixFiles } from "./files";
import { mapLimit } from "./pool";
import { printText } from "./report";
import { toSarif } from "./sarif";

async function version(): Promise<string> {
  const file = Bun.file(`${import.meta.dir}/../../package.json`);
  return (await file.exists()) ? (await file.json()).version : "unknown";
}

try {
  const command = parseCommand(process.argv.slice(2));
  if (command.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }
  if (command.version) {
    console.log(`nixchecker ${await version()}`);
    process.exit(0);
  }

  const paths = await nixFiles(command.paths);
  if (paths.length === 0) throw new UsageError("no .nix files found");
  // Several files are checked at once: the sources Nix needs are built only once, whoever asks first.
  const results = await mapLimit(paths, command.jobs, (path) =>
    checkFile(path, { ...command, version: command.release }),
  );

  // The JSON has one shape, whatever the number of files: bump `schemaVersion` if it ever changes.
  if (command.format === "sarif") console.log(JSON.stringify(toSarif(results), null, 2));
  else if (command.format === "json") {
    console.log(JSON.stringify({ schemaVersion: 1, results }, null, 2));
  } else {
    for (const r of results) {
      if (results.length > 1) console.log(`\n== ${r.file}`);
      const { checked, total } = r.coverage;
      printText(
        r.items,
        `${checked} of ${total} assignments checked statically.`,
        r.evaluated || !!command.static,
      );
    }
  }
  process.exit(results.some((r) => r.items.some((i) => i.severity === "error")) ? 1 : 0);
} catch (error) {
  if (!(error instanceof UsageError)) throw error;
  console.error(`nixchecker: ${error.message}\nTry 'nixchecker --help'.`);
  process.exit(2);
}
