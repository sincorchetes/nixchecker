{
  description = "nixchecker: check NixOS, Home Manager, disko and flake files against the official options";

  # nix run github:sincorchetes/nixchecker -- configuration.nix
  # nix run github:sincorchetes/nixchecker#lsp
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAll = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});

      # The command line and the language server: Bun running the TypeScript, which reads the catalogs
      # that sit next to it. Nix itself is the user's: `evaluate` calls the one on the PATH.
      package =
        pkgs:
        let
          inherit (pkgs.lib) fileset;
        in
        pkgs.stdenvNoCC.mkDerivation {
          pname = "nixchecker";
          version = "0.0.0+${self.shortRev or "dirty"}";
          src = fileset.toSource {
            root = ./.;
            fileset = fileset.unions [
              ./src/lib
              ./tools/local
              ./tools/lsp
              ./tools/corpus/sources.ts
              ./tools/catalog/flake.nix
              ./tools/catalog/flake.lock
              ./tools/catalog/shapes.nix
              ./public/catalog
            ];
          };
          nativeBuildInputs = [ pkgs.makeWrapper ];
          dontBuild = true;
          installPhase = ''
            mkdir -p $out/share/nixchecker $out/bin
            cp -r . $out/share/nixchecker
            makeWrapper ${pkgs.bun}/bin/bun $out/bin/nixchecker \
              --add-flags $out/share/nixchecker/tools/local/check.ts
            makeWrapper ${pkgs.bun}/bin/bun $out/bin/nixchecker-lsp \
              --add-flags $out/share/nixchecker/tools/lsp/server.ts
          '';
          meta = {
            description = "Check NixOS, Home Manager, disko and flake files against the official options";
            license = pkgs.lib.licenses.gpl3Plus;
            mainProgram = "nixchecker";
          };
        };
    in
    {
      packages = forAll (pkgs: rec {
        nixchecker = package pkgs;
        default = nixchecker;
      });

      apps = forAll (pkgs: {
        default = {
          type = "app";
          program = "${self.packages.${pkgs.system}.nixchecker}/bin/nixchecker";
        };
        lsp = {
          type = "app";
          program = "${self.packages.${pkgs.system}.nixchecker}/bin/nixchecker-lsp";
        };
      });

      # What `nix flake check` runs: the packaged command line on a file, so a package that does not work
      # cannot be released.
      checks = forAll (pkgs: {
        cli = pkgs.runCommand "nixchecker-cli-check" { nativeBuildInputs = [ self.packages.${pkgs.system}.nixchecker ]; } ''
          export HOME=$TMPDIR
          echo '{ networking.hostName = 5; }' > bad.nix
          echo '{ networking.hostName = "box"; }' > good.nix
          nixchecker --static --target nixos good.nix
          if nixchecker --static --target nixos bad.nix; then echo "a wrong type passed"; exit 1; fi
          touch $out
        '';
      });
    };
}
