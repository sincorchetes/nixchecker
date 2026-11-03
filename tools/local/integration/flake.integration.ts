// The command line against real Nix, on flakes: their NixOS and Home Manager configurations, and their other
// outputs when asked. `devenv shell -- integration` (needs Nix; the first run builds the pinned sources).
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { currentSystem, evaluate, scratch, writeFlake } from "./support";

const TIME = 900_000;

describe("the other outputs of a flake", () => {
  const broken = async () => {
    const flake = await scratch();
    const system = await currentSystem();
    // A package that cannot even be evaluated, next to one that can.
    await writeFlake(flake, {
      outputs: `packages.${system} = {
        fine = nixpkgs.legacyPackages.${system}.hello;
        broken = throw "this package is broken on purpose";
      };`,
    });
    return { flake, system };
  };

  test(
    "are left alone unless asked for, as documented",
    async () => {
      const { flake } = await broken();
      const run = await evaluate("--format", "json", join(flake, "flake.nix"));
      expect(run.code).toBe(0);
    },
    TIME,
  );

  test(
    "with --all-outputs, a package that cannot be evaluated is found, by name",
    async () => {
      const { flake, system } = await broken();
      const run = await evaluate("--format", "json", "--all-outputs", join(flake, "flake.nix"));
      expect(run.code).toBe(1);
      const errors = run.items.filter((i) => i.severity === "error");
      expect(errors.map((i) => i.config)).toEqual([`packages.${system}.broken`]);
      expect(errors[0]?.message).toContain("this package is broken on purpose");
    },
    TIME,
  );
});

describe("a flake with a NixOS and a Home Manager configuration", () => {
  test(
    "that is right passes, and each configuration was evaluated",
    async () => {
      const flake = await scratch();
      await writeFlake(flake);
      const run = await evaluate("--format", "json", join(flake, "flake.nix"));
      expect(run.items.filter((i) => i.severity === "error")).toEqual([]);
      expect(run.code).toBe(0);
    },
    TIME,
  );

  test(
    "a wrong value in each is found, and says which configuration it is in",
    async () => {
      const flake = await scratch();
      await writeFlake(flake, {
        nixos: "networking.hostName = 5;",
        home: 'programs.git.enable = "yes";',
      });
      const run = await evaluate("--format", "json", join(flake, "flake.nix"));
      expect(run.code).toBe(1);
      const configs = run.items.filter((i) => i.severity === "error").map((i) => i.config);
      expect(configs.sort()).toEqual(["homeConfigurations.u", "nixosConfigurations.box"]);
    },
    TIME,
  );
});
