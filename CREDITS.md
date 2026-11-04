# Credits

nixchecker is an unofficial project, not affiliated with the NixOS Foundation, Home Manager,
nix-darwin or disko. It was built with the help of AI (Claude, by Anthropic).

Option data and documentation links come from:

- [NixOS options](https://search.nixos.org/options) and the [NixOS manual](https://nixos.org/manual/nixos/stable/)
- [Home Manager](https://nix-community.github.io/home-manager/options.xhtml)
- [nix-darwin](https://nix-darwin.github.io/nix-darwin/manual/index.html)
- [disko](https://github.com/nix-community/disko)
- [Nix manual: flake format](https://nix.dev/manual/nix/latest/command-ref/new-cli/nix3-flake.html#flake-format)

`tools/local/schemas/sarif-2.1.0.json` is the SARIF 2.1.0 JSON schema published by the
[OASIS SARIF technical committee](https://github.com/oasis-tcs/sarif-spec), vendored unchanged to check
the SARIF this project prints; it is checked with [Ajv](https://ajv.js.org).

Built with [Astro](https://astro.build), [Bun](https://bun.sh), [Biome](https://biomejs.dev) and
[devenv](https://devenv.sh). Fonts: Bricolage Grotesque and JetBrains Mono (SIL Open Font License) via Fontsource.
