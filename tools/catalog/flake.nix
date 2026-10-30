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
        };
        "2605" = {
          nixpkgs = inputs.nixpkgs-2605;
          home-manager = inputs.home-manager-2605;
        };
        "2511" = {
          nixpkgs = inputs.nixpkgs-2511;
          home-manager = inputs.home-manager-2511;
        };
      };

      bundle =
        pkgs: name: src: options:
        let
          documented =
            (pkgs.nixosOptionsDoc {
              inherit options;
              warningsAreErrors = false;
            }).optionsJSON;
          hidden = map (o: o.name) (
            lib.filter (o: !(o.visible or true)) (lib.optionAttrSetToDocList options)
          );
        in
        pkgs.runCommand "nixchecker-catalog-${name}" { } ''
          mkdir $out
          cp ${documented}/share/doc/nixos/options.json $out/options.json
          cp ${pkgs.writeText "hidden.json" (builtins.toJSON hidden)} $out/hidden.json
          cp ${pkgs.writeText "shapes.json" (builtins.toJSON (import ./shapes.nix { inherit lib; } options))} $out/shapes.json
          ln -s ${src} $out/src
        '';

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
        release:
        release.home-manager.lib.homeManagerConfiguration {
          pkgs = release.nixpkgs.legacyPackages.${system};
          modules = [
            {
              home = {
                username = "user";
                homeDirectory = "/home/user";
                stateVersion = "25.05";
              };
            }
          ];
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
            hm release
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
        };
    };
}
