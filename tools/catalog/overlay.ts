import type { Overlay } from "../../src/lib/catalog/convert";
import { type OptionEntry, opt, type Target } from "../../src/lib/catalog/types";

// disko's disk layouts are polymorphic submodules selected by `type`, so its manual only
// documents the top level. These are the nested options users write most often.
const content = ["gpt", "table", "filesystem", "luks", "lvm_pv", "btrfs", "zfs", "swap", "mdraid"];
const disk = "disko.devices.disk.*";
const part = `${disk}.content.partitions.*`;
const nodev = "disko.devices.nodev.*";

const diskoEntries: OptionEntry[] = [
  opt(`${disk}.type`, "enum", { values: ["disk"] }),
  // Free-form on purpose: only the options below are checked inside it.
  opt(`${disk}.content`, "attrs"),
  opt(`${disk}.content.type`, "enum", { values: content }),
  opt(`${part}.size`, "str"),
  opt(`${part}.type`, "str"),
  opt(`${part}.priority`, "int"),
  opt(`${part}.content.type`, "enum", { values: content }),
  opt(`${part}.content.format`, "str"),
  opt(`${part}.content.mountpoint`, "str"),
  opt(`${part}.content.mountOptions`, "list"),
  opt(`${nodev}.fsType`, "str"),
  opt(`${nodev}.device`, "str"),
  opt(`${nodev}.mountpoint`, "str"),
  opt(`${nodev}.mountOptions`, "list"),
];

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

// Keys of the module system itself, which no manual lists as options.
const moduleEntries: OptionEntry[] = [
  opt("imports", "list"),
  opt("disabledModules", "list"),
  opt("options", "any"),
  opt("config", "any"),
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
  disko: { entries: [...moduleEntries, ...diskoEntries] },
  flake: { entries: flakeEntries },
};
