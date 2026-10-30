{
  # Pins the upstream projects whose option documentation nixchecker validates against.
  # `nix build ./tools/catalog#nixos` (and #home-manager, #disko) yields a directory with:
  #   options.json  the documented options, as rendered in the official manuals
  #   hidden.json   names of options hidden from the manuals (aliases, renamed or removed options)
  #   src           the module sources, where renames are read from (see build.ts)
  description = "Option catalogs for nixchecker";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    disko = {
      url = "github:nix-community/disko";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      nixpkgs,
      home-manager,
      disko,
      ...
    }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
      inherit (nixpkgs) lib;

      bundle =
        name: src: options:
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
          ln -s ${src} $out/src
        '';

      nixosSystem =
        extra:
        lib.nixosSystem {
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

      hm = home-manager.lib.homeManagerConfiguration {
        inherit pkgs;
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
    in
    {
      packages.${system} = {
        nixos = bundle "nixos" "${nixpkgs}/nixos/modules" (nixosSystem [ ]).options;
        home-manager = bundle "home-manager" "${home-manager}/modules" hm.options;
        disko = bundle "disko" "${disko}" { disko = (nixosSystem [ disko.nixosModules.disko ]).options.disko; };
      };
    };
}
