# Changelog

All notable changes to nixchecker. The format follows [Keep a Changelog](https://keepachangelog.com);
versions are the `v0.0.N` tags, each published as a GitHub Release with its notes.

## Unreleased

### Added

- A `path` option type: a string given to an absolute-path option must start with `/`.
- `evaluate` accepts its options before or after the file; `.gitleaks.toml` scopes the secret-scan
  exception for the catalog manifest hashes.
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
- `evaluate` checks several files and directories in one run, evaluates the NixOS and Home Manager
  configurations of a flake with its own inputs, and takes `--partial` for a file that is part of a
  system (its options are read; the assertions of a whole system are skipped).
- The page validates by itself when the text rests for a moment (the button still validates at once).
- The analysis runs in a Web Worker (in the page where one cannot start), and a service worker keeps
  the page and the catalogs used so it works with no connection after the first visit.
- Syntax colors in the editor (comments, strings, numbers, keywords, paths) and the findings underlined
  where they are, for text up to 200 KB; in forced-colors mode the plain text area is shown.
- Open a `.nix` file with a picker or by dropping it on the editor (read in the browser, up to 512 KB),
  download the report as JSON, and, if asked, keep the text between visits in this browser.
- `evaluate --format json|sarif`: the JSON carries the coverage and the revisions of the catalog used;
  SARIF feeds code scanning annotations.
- The nested options of disko's disk layouts (partitions, `content`, subvolumes, datasets...) are read
  from disko's own serialized types instead of a hand-written overlay.

### Verified by

- The parser against every `.nix` file of nixpkgs and Home Manager (`corpus`), and against the
  official `nix-instantiate --parse` on damaged copies of them (`differential`).
- The validator against the real NixOS, Home Manager and disko module systems, on written and
  generated modules, on every release (`oracle`).
- Browser tests in Chrome and Firefox, with axe-core on every state of the page, in both languages and
  color schemes.

### Changed

- `evaluate`: when Nix accepts a module, the static findings it settles are dropped; when it fails, a
  static finding at the same place is merged with the confirmed one, and an error in an imported module
  names its file.
- A value written below an `attrsOf` option is judged by the deepest option that knows its type, and
  attributes written below a list option are a type error.
- Names with dots inside quotes (`services.akkoma.config.":pleroma"."Pleroma.Web.Endpoint".http.port`)
  are one attribute in the catalogs, as they are in the file, instead of being cut at every dot.
- The oracle may miss at most 3 % of the wrong values (it was 7 %).
- GitHub Actions are pinned by commit, and so is devenv.
