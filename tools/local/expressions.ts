// The Nix expressions that build a system out of a module with the real module systems.
export type Kind = "nixos" | "home-manager" | "disko" | "nix-darwin";

/** The sources the evaluations are made from. */
export interface Roots {
  nixpkgs: string;
  homeManager: string;
  disko: string;
  nixDarwin: string;
  /** The system the configuration is built for, as flakes name it (`aarch64-linux`). */
  system: string;
}

const quote = (s: string) => JSON.stringify(s);

// Something every system has, to read first: an unknown option is found by reading any of them.
export const BASE: Record<Kind, string[]> = {
  nixos: ["system", "name"],
  "home-manager": ["home", "username"],
  disko: ["system", "name"],
  "nix-darwin": ["nix", "enable"],
};

/**
 * An expression taking `args` (an attribute set pattern such as `{ file, path }`). In `force`, `config`
 * is the configuration of the system made of the module `file` and `top` the path of its derivation, which
 * only evaluates when every assertion of the system holds. With `lenient` the module system does not
 * check that every option written exists (`_module.check = false`), so what is wrong with the others shows.
 */
export function systemExpression(
  kind: Kind,
  r: Roots,
  args: string,
  force: string,
  lenient = false,
): string {
  const loose = lenient ? "{ _module.check = false; }" : "";
  if (kind === "home-manager") {
    return `${args}:
let
  pkgs = import ${quote(r.nixpkgs)} { system = ${quote(r.system)}; };
  hm = import (${quote(r.homeManager)} + "/modules") {
    inherit pkgs;
    configuration = {
      imports = [ file ${loose} ];
      home = { username = "u"; homeDirectory = "/home/u"; stateVersion = "25.05"; };
    };
  };
  config = hm.config;
  top = hm.activationPackage.drvPath;
in
${force}`;
  }
  if (kind === "nix-darwin") {
    return `${args}:
let
  ev = import ${quote(r.nixDarwin)} {
    nixpkgs = ${quote(r.nixpkgs)};
    system = ${quote(r.system)};
    configuration = { imports = [ file ${loose} ]; };
  };
  config = ev.config;
  top = ev.config.system.build.toplevel.drvPath;
in
${force}`;
  }
  // disko is a module of a NixOS system.
  const extra = kind === "disko" ? `(${quote(r.disko)} + "/module.nix")` : "";
  return `${args}:
let
  ev = import (${quote(r.nixpkgs)} + "/nixos/lib/eval-config.nix") {
    system = ${quote(r.system)};
    modules = [ file ${extra} ${loose} ];
  };
  config = ev.config;
  top = ev.config.system.build.toplevel.drvPath;
in
${force}`;
}
