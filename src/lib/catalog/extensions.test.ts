import { describe, expect, test } from "bun:test";
import { EXTENSIONS, extensionCatalog, extensionOf, extensionsFor } from "./extensions";
import { docUrl } from "./index";

const paths = (...dotted: string[]) => dotted.map((p) => p.split("."));

describe("extensions of NixOS", () => {
  test("a file asks for the extensions it writes below", () => {
    const names = (target: "nixos" | "home-manager", ...p: string[]) =>
      extensionsFor(target, paths(...p)).map((e) => e.name);
    expect(names("nixos", "sops.secrets.x.owner")).toEqual(["sops-nix"]);
    expect(names("nixos", "age.secrets", "services.openssh.enable")).toEqual(["agenix"]);
    expect(names("nixos", "environment.persistence./persist.directories")).toEqual([
      "impermanence",
    ]);
    expect(names("nixos", "sops", "age", "environment.persistence")).toEqual([
      "sops-nix",
      "agenix",
      "impermanence",
    ]);
  });

  test("a sibling of an extension's prefix, or another target, asks for none", () => {
    expect(
      extensionsFor("nixos", paths("environment.systemPackages", "agent.x", "services.a")),
    ).toEqual([]);
    expect(extensionsFor("home-manager", paths("age.secrets", "home.persistence"))).toEqual([]);
    expect(extensionsFor("nix-darwin", paths("sops.secrets"))).toEqual([]);
    expect(extensionsFor("nixos", [])).toEqual([]);
  });

  test("an option is told to be an extension's from its path, and its docs are the project's", () => {
    expect(extensionOf("nixos", "sops.secrets.*.owner")?.name).toBe("sops-nix");
    expect(extensionOf("nixos", "environment.persistence")?.name).toBe("impermanence");
    expect(extensionOf("nixos", "environment.etc")).toBeUndefined();
    expect(docUrl("nixos", "sops.secrets.x")).toBe(EXTENSIONS[0]?.docs as string);
    expect(extensionsFor("home-manager", paths("sops.secrets.x")).map((e) => e.target)).toEqual([
      "home-manager",
    ]);
    expect(docUrl("home-manager", "sops.secrets.x")).toContain("sops-nix#home-manager");
    expect(docUrl("home-manager", "programs.git.enable")).toEndWith("#opt-programs.git.enable");
    expect(docUrl("nixos", "services.openssh.enable")).toStartWith("https://search.nixos.org/");
  });

  test("each has its own catalog directory", () => {
    expect(EXTENSIONS.map(extensionCatalog)).toEqual([
      "ext-sops-nix",
      "ext-sops-nix-home",
      "ext-agenix",
      "ext-lanzaboote",
      "ext-impermanence",
    ]);
  });
});
