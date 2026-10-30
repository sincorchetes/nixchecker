{
  # Pins the upstream projects whose option documentation nixchecker validates against.
  # `nix build ./tools/catalog#nixos-2605` (and #home-manager-2605, #nixos-unstable, #disko...) yields a
  # directory with:
  #   options.json  the documented options, as rendered in the official manuals
  #   hidden.json   names of options hidden from the manuals (aliases, renamed or removed options)
  #   coerced.json  names of options whose type converts what it is given (a number may be a string)
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

      # Names of the options whose type converts its value (`coercedTo`), looking inside submodules too:
      # their manual description is that of the final type, so a number would look wrong for a string.
      coercedOptions =
        options:
        let
          # Submodules can contain themselves: stop a few levels down, which is as deep as the manuals go.
          walk =
            depth: opts:
            lib.optionals (depth < 6) (
              lib.concatMap (
              opt:
              let
                t = opt.type;
                base = if t.name == "nullOr" then t.nestedTypes.elemType else t;
                shallow = (opt.visible or true) == "shallow";
                sub = if shallow then { } else t.getSubOptions opt.loc;
              in
              lib.optional (base.name == "coercedTo") (lib.showOption opt.loc)
              ++ lib.optionals (sub != { }) (walk (depth + 1) (lib.collect lib.isOption sub))
              ) opts
            );
        in
        walk 0 (lib.collect lib.isOption options);

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
          cp ${pkgs.writeText "coerced.json" (builtins.toJSON (coercedOptions options))} $out/coerced.json
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
