# Changelog

All notable changes to nixchecker. The format follows [Keep a Changelog](https://keepachangelog.com);
versions are the `v0.0.N` tags, each published as a GitHub Release with its notes.

## Unreleased

### Added

- Validation of NixOS, Home Manager and disko files and flakes in the browser, against catalogs read
  from the official sources: unknown options with suggestions, wrong types, renamed and hidden
  options, undefined names and calls that cannot work, with line and column.
- Catalogs per release (26.05, 25.11, unstable), downloaded in pieces as the file needs them.
- A summary of how many assignments could be checked and why the rest could not, with a button per
  reason that jumps to them.
- `devenv shell -- evaluate`: checks a file with the static analysis and with the real module system
  of the local Nix (imports, `mkIf`, merging, assertions), marking each finding by how sure it is.
- Catalog types read from Nix's own type objects (alternatives, list elements, values of attribute
  sets, converting types) instead of from the sentences of the manuals.
- `public/catalog/manifest.json`: the revision of every source and the hash of every catalog file.

### Verified by

- The parser against every `.nix` file of nixpkgs and Home Manager (`corpus`), and against the
  official `nix-instantiate --parse` on damaged copies of them (`differential`).
- The validator against the real NixOS, Home Manager and disko module systems, on written and
  generated modules, on every release (`oracle`).
- Browser tests in Chrome and Firefox, with axe-core on every state of the page, in both languages and
  color schemes.

### Changed

- GitHub Actions are pinned by commit, and so is devenv.
