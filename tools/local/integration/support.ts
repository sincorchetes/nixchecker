// What the integration tests share: a scratch directory, the command line as a person runs it, and the
// pinned sources a flake can be made of (needs Nix).
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { releaseRoots } from "../../corpus/sources";

const check = join(import.meta.dir, "..", "check.ts");

export const scratch = () => mkdtemp(join(tmpdir(), "nixchecker-integration-"));

export interface Item {
  level: string;
  severity: string;
  message: string;
  code?: string;
  file?: string;
  config?: string;
  line?: number;
  col?: number;
}

export interface Run {
  code: number;
  out: string;
  err: string;
  /** The items of the first result, when the run printed JSON. */
  items: Item[];
}

/** Runs the command line with these arguments; `--format json` is read back. */
export async function evaluate(...args: string[]): Promise<Run> {
  const proc = Bun.spawn(["bun", check, ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  const json = args.includes("json") ? JSON.parse(out) : undefined;
  return { code, out, err, items: json?.results?.[0]?.items ?? [] };
}

/** The pinned nixpkgs and Home Manager of the default release, as store paths. */
export const sources = async () => {
  const [nixpkgs, homeManager] = await releaseRoots("26.05");
  return { nixpkgs: nixpkgs as string, homeManager: homeManager as string };
};

/** The system this runs on, as flakes name it (`x86_64-linux`). */
export async function currentSystem(): Promise<string> {
  const proc = Bun.spawn(
    [
      "nix",
      "eval",
      "--impure",
      "--raw",
      "--expr",
      "builtins.currentSystem",
      "--extra-experimental-features",
      "nix-command",
    ],
    { stdout: "pipe", stderr: "ignore" },
  );
  return (await new Response(proc.stdout).text()).trim();
}

/**
 * Writes a flake that has one NixOS and one Home Manager configuration, with extra settings in each, and
 * more outputs (`outputs`, as attributes of the flake) when given.
 */
export async function writeFlake(
  dir: string,
  extra: { nixos?: string; home?: string; outputs?: string } = {},
) {
  const { nixpkgs, homeManager } = await sources();
  await Bun.write(
    join(dir, "flake.nix"),
    `{
  inputs = {
    nixpkgs.url = "path:${nixpkgs}";
    home-manager = {
      url = "path:${homeManager}";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };
  outputs = { nixpkgs, home-manager, ... }: {
    nixosConfigurations.box = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [ {
        boot.loader.grub.enable = false;
        fileSystems."/" = { device = "none"; fsType = "tmpfs"; };
        system.stateVersion = "25.05";
        ${extra.nixos ?? ""}
      } ];
    };
    homeConfigurations.u = home-manager.lib.homeManagerConfiguration {
      pkgs = nixpkgs.legacyPackages.x86_64-linux;
      modules = [ {
        home = { username = "u"; homeDirectory = "/home/u"; stateVersion = "25.05"; };
        ${extra.home ?? ""}
      } ];
    };
    ${extra.outputs ?? ""}
  };
}
`,
  );
  // The lock names the store paths above, so it needs no network.
  const lock = Bun.spawn(
    ["nix", "flake", "lock", `path:${dir}`, "--extra-experimental-features", "nix-command flakes"],
    { stdout: "ignore", stderr: "inherit" },
  );
  if ((await lock.exited) !== 0) throw new Error("nix flake lock failed");
}
