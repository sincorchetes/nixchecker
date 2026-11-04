import { describe, expect, test } from "bun:test";
import { nixConfEntries, type Settings } from "./nix-conf";

const settings: Settings = {
  "max-jobs": { aliases: [], defaultValue: 1 },
  sandbox: { aliases: [], defaultValue: true },
  "keep-going": { aliases: [], defaultValue: false },
  cores: { aliases: [], defaultValue: 0 },
  "netrc-file": { aliases: [], defaultValue: "/etc/nix/netrc" },
  "diff-hook": { aliases: [], defaultValue: null },
  substituters: { aliases: [], defaultValue: ["https://cache.nixos.org"] },
  "plugin-files": { aliases: [], defaultValue: [] },
  "sandbox-paths": { aliases: ["build-chroot-dirs"], defaultValue: {} },
};
const TEXT = ["str", "list", "bool", "int"];
const entries = Object.fromEntries(nixConfEntries(settings).map((e) => [e.path, e]));

describe("nix.conf settings", () => {
  test("the default value tells the type", () => {
    expect(entries["keep-going"]).toMatchObject({ type: "bool" });
    expect(entries.cores).toMatchObject({ type: "int" });
    expect(entries["netrc-file"]).toMatchObject({ type: "mix", values: TEXT });
    expect(entries["diff-hook"]).toMatchObject({ type: "mix", values: TEXT });
  });

  test("a list also has its extra- form, and a single word is a list of one", () => {
    expect(entries.substituters).toMatchObject({ type: "mix", values: TEXT });
    expect(entries["extra-substituters"]).toMatchObject({ type: "mix", values: TEXT });
    expect(entries["extra-cores"]).toBeUndefined();
    expect(entries["plugin-files"]).toMatchObject({ type: "mix" });
    expect(entries["extra-plugin-files"]).toBeUndefined();
  });

  test("a set is not checked, and an alias is the same setting", () => {
    expect(entries["sandbox-paths"]).toMatchObject({ type: "any" });
    expect(entries["extra-sandbox-paths"]).toMatchObject({ type: "any" });
    expect(entries["build-chroot-dirs"]).toMatchObject({ type: "any" });
  });

  test("max-jobs and sandbox take their special words", () => {
    expect(entries["max-jobs"]).toMatchObject({ type: "mix", values: ["int", 'enum:["auto"]'] });
    expect(entries.sandbox).toMatchObject({ type: "mix", values: ["bool", 'enum:["relaxed"]'] });
  });

  test("the entries are sorted", () => {
    const paths = nixConfEntries(settings).map((e) => e.path);
    expect(paths).toEqual([...paths].sort());
  });
});
