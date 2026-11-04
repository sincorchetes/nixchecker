{
  # Pins the upstream projects whose option documentation nixchecker validates against.
  # `nix build ./tools/catalog#nixos-2605` (and #home-manager-2605, #nixos-unstable, #disko...) yields a
  # directory with:
  #   options.json  the documented options, as rendered in the official manuals
  #   hidden.json   names of options hidden from the manuals (aliases, renamed or removed options)
  #   shapes.json   the real type of every option (see shapes.nix)
  #   src           the module sources, where renames are read from (see build.ts)
  # Releases are named without the dot (2605 is 26.05); build.ts maps them to the versions of the site.
  description = "Option catalogs for nixchecker";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    nixpkgs-2605.url = "github:NixOS/nixpkgs/nixos-26.05";
    nixpkgs-2511.url = "github:NixOS/nixpkgs/nixos-25.11";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    home-manager-2605 = {
      url = "github:nix-community/home-manager/release-26.05";
      inputs.nixpkgs.follows = "nixpkgs-2605";
    };
    home-manager-2511 = {
      url = "github:nix-community/home-manager/release-25.11";
      inputs.nixpkgs.follows = "nixpkgs-2511";
    };
    nix-darwin = {
      url = "github:nix-darwin/nix-darwin/master";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    nix-darwin-2605 = {
      url = "github:nix-darwin/nix-darwin/nix-darwin-26.05";
      inputs.nixpkgs.follows = "nixpkgs-2605";
    };
    nix-darwin-2511 = {
      url = "github:nix-darwin/nix-darwin/nix-darwin-25.11";
      inputs.nixpkgs.follows = "nixpkgs-2511";
    };
    sops-nix = {
      url = "github:Mic92/sops-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    agenix = {
      url = "github:ryantm/agenix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    impermanence.url = "github:nix-community/impermanence";
    disko = {
      url = "github:nix-community/disko";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs@{ nixpkgs, disko, ... }:
    let
      system = "x86_64-linux";
      inherit (nixpkgs) lib;

      # Each release pairs a nixpkgs with the Home Manager of the same release.
      releases = {
        unstable = {
          nixpkgs = inputs.nixpkgs;
          home-manager = inputs.home-manager;
          nix-darwin = inputs.nix-darwin;
        };
        "2605" = {
          nixpkgs = inputs.nixpkgs-2605;
          home-manager = inputs.home-manager-2605;
          nix-darwin = inputs.nix-darwin-2605;
        };
        "2511" = {
          nixpkgs = inputs.nixpkgs-2511;
          home-manager = inputs.home-manager-2511;
          nix-darwin = inputs.nix-darwin-2511;
        };
      };

      bundle = pkgs: name: src: options: bundleWith pkgs name src options "";

      # `extra` is shell run once the bundle is made.
      bundleWith =
        pkgs: name: src: options: extra:
        let
          documented =
            (pkgs.nixosOptionsDoc {
              inherit options;
              warningsAreErrors = false;
            }).optionsJSON;
          # Options the manuals leave out: those that are not visible, and the internal ones (which exist and can
          # be set, as `system.path` or `assertions`; the manuals just do not document them).
          hidden = map (o: o.name) (
            lib.filter (o: !(o.visible or true) || (o.internal or false)) (
              lib.optionAttrSetToDocList options
            )
          );
        in
        pkgs.runCommand "nixchecker-catalog-${name}" { } ''
          mkdir $out
          cp ${documented}/share/doc/nixos/options.json $out/options.json
          cp ${pkgs.writeText "hidden.json" (builtins.toJSON hidden)} $out/hidden.json
          cp ${pkgs.writeText "shapes.json" (builtins.toJSON (import ./shapes.nix { inherit lib; } options))} $out/shapes.json
          ln -s ${src} $out/src
          ${extra}
        '';

      # Modules of other projects that add options to NixOS. The bundle holds only those options, and the
      # path of the module, which the oracle puts to the real module system.
      extension =
        name: src: module: roots:
        extensionOf name src module roots (nixosSystem releases.unstable [ module ]).options "";

      # The same for the modules of Home Manager (the bundle is `ext-<name>-home`).
      homeExtension =
        name: src: module: roots:
        extensionOf name src module roots (hm releases.unstable [ module ]).options "-home";

      extensionOf =
        name: src: module: roots: options: suffix:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        bundleWith pkgs "ext-${name}${suffix}" "${src}" (lib.foldl' lib.recursiveUpdate { } (
          map (root: lib.setAttrByPath root (lib.attrByPath root null options)) roots
        )) "echo -n ${module} > $out/module-path";

      nixosSystem =
        release: extra:
        release.nixpkgs.lib.nixosSystem {
          inherit system;
          modules = extra ++ [
            {
              boot.loader.grub.enable = false;
              fileSystems."/" = {
                device = "none";
                fsType = "tmpfs";
              };
              system.stateVersion = "25.05";
            }
          ];
        };

      hm =
        release: extra:
        release.home-manager.lib.homeManagerConfiguration {
          pkgs = release.nixpkgs.legacyPackages.${system};
          modules = extra ++ [
            {
              home = {
                username = "user";
                homeDirectory = "/home/user";
                stateVersion = "25.05";
              };
            }
          ];
        };

      # nix-darwin is evaluated for a Mac; the documentation is built on this system, so nothing is built for it.
      darwin =
        release:
        release.nix-darwin.lib.darwinSystem {
          system = "aarch64-darwin";
          modules = [ { system.stateVersion = 6; } ];
        };

      perRelease =
        name: release:
        let
          pkgs = release.nixpkgs.legacyPackages.${system};
        in
        {
          "nixos-${name}" = bundle pkgs "nixos-${name}" "${release.nixpkgs}/nixos/modules" (
            nixosSystem release [ ]
          ).options;
          "home-manager-${name}" = bundle pkgs "home-manager-${name}" "${release.home-manager}/modules" (
            hm release [ ]
          ).options;
          "nix-darwin-${name}" = bundle pkgs "nix-darwin-${name}" "${release.nix-darwin}/modules" (
            darwin release
          ).options;
        };
    in
    {
      packages.${system} =
        lib.foldl' (acc: name: acc // perRelease name releases.${name}) { } (lib.attrNames releases)
        // {
          disko = bundle nixpkgs.legacyPackages.${system} "disko" "${disko}" {
            disko = (nixosSystem releases.unstable [ disko.nixosModules.disko ]).options.disko;
          };
          ext-sops-nix = extension "sops-nix" inputs.sops-nix "${inputs.sops-nix}/modules/sops" [ [ "sops" ] ];
          ext-sops-nix-home = homeExtension "sops-nix" inputs.sops-nix "${inputs.sops-nix}/modules/home-manager/sops.nix" [ [ "sops" ] ];
          ext-agenix = extension "agenix" inputs.agenix "${inputs.agenix}/modules/age.nix" [ [ "age" ] ];
          ext-impermanence = extension "impermanence" inputs.impermanence "${inputs.impermanence}/nixos.nix" [
            [
              "environment"
              "persistence"
            ]
          ];
          # The settings of nix.conf as the Nix of the development nixpkgs describes them.
          nix-conf =
            nixpkgs.legacyPackages.${system}.runCommand "nixchecker-catalog-nix-conf"
              { nativeBuildInputs = [ nixpkgs.legacyPackages.${system}.nix ]; }
              ''
                mkdir $out
                export HOME=$TMPDIR NIX_CONF_DIR=$TMPDIR/etc
                nix config show --json --extra-experimental-features nix-command > $out/config.json
                nix --version > $out/version
              '';
          # The options of every disk layout type, as disko serializes them for its own documentation.
          disko-types = nixpkgs.legacyPackages.${system}.writeText "disko-types.json" (
            builtins.toJSON disko.lib.jsonTypes
          );
        };
    };
}
