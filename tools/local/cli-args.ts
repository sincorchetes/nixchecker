// The command line of `nixchecker`: what it takes, and a usage error (exit 2) for anything it does not.
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import { DEFAULT_VERSION, VERSIONS, type Version } from "../../src/lib/catalog/versions";

export const FORMATS = ["text", "json", "sarif"] as const;
const TARGETS = ["auto", "nixos", "home-manager", "disko", "flake"];

export const HELP = `Usage: nixchecker [options] <file.nix | directory>...

Checks NixOS, Home Manager, disko and flake files against the official options (static analysis), and
against the module system of your own Nix (real evaluation). Directories are searched for .nix files.

Options:
  --target <t>        what the file is: ${TARGETS.join(", ")} (default: auto, as the web page decides)
  --release <v>       release of nixpkgs and Home Manager: ${VERSIONS.join(", ")} (default: ${DEFAULT_VERSION})
  --static            static analysis only; do not evaluate with Nix
  --partial           the file is part of a system, not all of it: read its options, skip the
                      assertions of a whole system (root file system, boot loader)
  --format <f>        ${FORMATS.join(", ")} (default: text); sarif is for code scanning
  --json              same as --format json
  --all-outputs       for a flake, also evaluate its packages, checks and devShells (the
                      default is its nixosConfigurations and homeConfigurations)
  --jobs <n>          files checked at the same time (default: ${Math.min(4, availableParallelism())})
  --nixpkgs <dir>     use this nixpkgs instead of building the pinned one (with --home-manager)
  --home-manager <dir>
  --disko <dir>
  --version           print the version and exit
  --help              print this help and exit

Exit status: 0 nothing wrong, 1 something is an error, 2 the command line is wrong.
`;

/** A mistake in how the command was written: shown without a stack, and the exit status is 2. */
export class UsageError extends Error {}

export interface Command {
  help: boolean;
  version: boolean;
  paths: string[];
  format: (typeof FORMATS)[number];
  release: Version;
  jobs: number;
  target?: string | undefined;
  nixpkgs?: string | undefined;
  homeManager?: string | undefined;
  disko?: string | undefined;
  static?: boolean | undefined;
  partial?: boolean | undefined;
  allOutputs?: boolean | undefined;
}

export function parseCommand(argv: string[]): Command {
  let parsed: ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>;
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true, options: OPTIONS });
  } catch (error) {
    throw new UsageError((error as Error).message.split(".")[0]);
  }
  const { values, positionals } = parsed;
  const format = values.format ?? (values.json ? "json" : "text");
  if (!(FORMATS as readonly string[]).includes(format)) {
    throw new UsageError(`--format is one of ${FORMATS.join(", ")}`);
  }
  const release = values.release ?? DEFAULT_VERSION;
  if (!(VERSIONS as readonly string[]).includes(release)) {
    throw new UsageError(`--release is one of ${VERSIONS.join(", ")}`);
  }
  if (values.target && !TARGETS.includes(values.target)) {
    throw new UsageError(`--target is one of ${TARGETS.join(", ")}`);
  }
  const jobs = Number(values.jobs ?? Math.min(4, availableParallelism()));
  if (!Number.isInteger(jobs) || jobs < 1) throw new UsageError("--jobs is a number from 1");
  const help = values.help === true;
  const version = values.version === true;
  if (positionals.length === 0 && !help && !version) throw new UsageError("no file given");
  return {
    help,
    version,
    paths: positionals,
    format: format as Command["format"],
    release: release as Version,
    jobs,
    target: values.target,
    nixpkgs: values.nixpkgs,
    homeManager: values["home-manager"],
    disko: values.disko,
    static: values.static,
    partial: values.partial,
    allOutputs: values["all-outputs"],
  };
}

const OPTIONS = {
  target: { type: "string" },
  release: { type: "string" },
  nixpkgs: { type: "string" },
  "home-manager": { type: "string" },
  disko: { type: "string" },
  static: { type: "boolean" },
  partial: { type: "boolean" },
  "all-outputs": { type: "boolean" },
  json: { type: "boolean" },
  format: { type: "string" },
  jobs: { type: "string", short: "j" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
} as const;
