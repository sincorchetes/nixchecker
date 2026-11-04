import type { Overlay } from "../../src/lib/catalog/convert";
import { type OptionEntry, opt, type Target } from "../../src/lib/catalog/types";

// Top-level attributes of flake.nix, from the "Flake format" section of the Nix manual.
const flakeEntries: OptionEntry[] = [
  opt("description", "str"),
  opt("inputs.*.url", "str"),
  opt("inputs.*.flake", "bool"),
  opt("inputs.*.follows", "str"),
  opt("inputs.*.inputs.*.follows", "str"),
  opt("outputs", "any"),
  opt("nixConfig.extra-substituters", "list"),
  opt("nixConfig.extra-trusted-public-keys", "list"),
  opt("nixConfig.bash-prompt", "str"),
  opt("nixConfig.flake-registry", "str"),
];

// Keys of the module system itself, and options that exist but are internal, which no manual lists:
// `assertions` and `warnings` are what a module of your own writes to say that something is wrong, and
// `meta` (`maintainers`, `doc`, `buildDocsInSandbox`) is about the module.
const moduleEntries: OptionEntry[] = [
  opt("imports", "list"),
  opt("disabledModules", "list"),
  opt("options", "any"),
  opt("config", "any"),
  opt("assertions", "list"),
  opt("warnings", "list", { values: ["str"] }),
  opt("meta", "attrs"),
  opt("freeformType", "any"),
];

export const overlays: Record<Target, Overlay> = {
  nixos: {
    // Hidden upstream, so the replacement can only be written down by hand.
    renamed: {
      "services.xserver.displayManager.gdm.enable": "services.displayManager.gdm.enable",
      "services.xserver.desktopManager.gnome.enable": "services.desktopManager.gnome.enable",
    },
    entries: moduleEntries,
  },
  "home-manager": { entries: moduleEntries },
  "nix-darwin": { entries: moduleEntries },
  // The nested options of the disk layouts are read from disko itself (see disko.ts).
  disko: { entries: moduleEntries },
  flake: { entries: flakeEntries },
};
