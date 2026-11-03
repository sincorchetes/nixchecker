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
- `evaluate` asks Nix for its messages as data (`--log-format internal-json`) instead of cutting the text
  at the last `error:`: no colors or trace to skip, and the definitions Nix lists (where the option is set,
  and to what) and its "did you mean" are kept. Plain text is still read where Nix gives no data.
- When an option is set in several places of a file, `evaluate` picks the one whose value is what Nix
  printed (by its kind, and by its text for a string) and, if it still cannot tell, reports the other
  places too (`alternatives` in the JSON, related locations in SARIF) instead of choosing silently.
- `evaluate --all-outputs` also evaluates the `packages`, `checks` and `devShells` of a flake for the
  system it runs on (the default is still its NixOS and Home Manager configurations).
- The option type `package` is known to the validator: a number, a boolean, a list or any string that is
  not a path in the store is an error where a package (or a list of them) goes. Only a set, a name, a call
  or a string with `${...}` in it, which could be one, is let through.
- disko's layouts are read down to six levels of `content`, and below each device only what its types
  declare exists (the manual described hooks under `nodev` that the module does not have).
- `evaluate --partial` finds every wrong value of a file in one run, not only the first one Nix stops at:
  it asks which of the options the file sets fail to evaluate, and for the message of each of them. Options
  that do not exist no longer hide the wrong values of the rest: the file is read again with the module
  system's existence check off (`_module.check = false`).
- `evaluate --help`, `--version` and `--jobs`: every mistake in the command is one line with exit status 2,
  and several files are checked concurrently.
- A flake with the packaged command line and language server: `nix run github:sincorchetes/nixchecker`
  and `nix run github:sincorchetes/nixchecker#lsp`, checked by `nix flake check` in CI.
- The language server's hover also shows the description, default and example of an option, read from the
  manuals' own options file when it is available.
- `devenv shell -- lsp`: a Language Server that publishes the static findings as diagnostics in any editor,
  with the certain fixes (misspelled or renamed options) as quick fixes, completes option names from the catalog and shows the type of an option on hover.
- The analysis runs in a Web Worker (in the page where one cannot start), and a service worker keeps
  the page and the catalogs used so it works with no connection after the first visit.
- Syntax colors in the editor (comments, strings, numbers, keywords, paths) and the findings underlined
  where they are, for text up to 200 KB; in forced-colors mode the plain text area is shown.
- Open a `.nix` file with a picker or by dropping it on the editor (read in the browser, up to 512 KB),
  download the report as JSON, and, if asked, keep the text between visits in this browser.
- `evaluate --format json|sarif`: the JSON carries the coverage and the revisions of the catalog used;
  SARIF feeds code scanning annotations. The JSON is always `{ "schemaVersion": 1, "results": [...] }`,
  one result per file.
- The nested options of disko's disk layouts (partitions, `content`, subvolumes, datasets...) are read
  from disko's own serialized types instead of a hand-written overlay.

### Verified by

- The parser against every `.nix` file of nixpkgs and Home Manager (`corpus`), and against the
  official `nix-instantiate --parse` on damaged copies of them (`differential`).
- The validator against the real NixOS, Home Manager and disko module systems, on written and
  generated modules, on every release (`oracle`).
- The command line against real Nix on an own module, an error in an imported file, `--partial` with
  and without the assertions of a whole system, and a flake with NixOS and Home Manager configurations
  (`integration`); its SARIF against the official SARIF 2.1.0 schema (OASIS).
- Browser tests in Chrome and Firefox, with axe-core on every state of the page, in both languages and
  color schemes.

### Fixed

- `evaluate --partial` no longer reads `imports`, `options` and the other keys of the module system as
  if they were options (it failed with `attribute 'imports' missing`), and reads what is under
  `config = { ... }` without that prefix.

### Changed

- `evaluate`: when Nix accepts a module, the static findings it settles are dropped; when it fails, a
  static finding at the same place is merged with the confirmed one, and an error in an imported module
  is placed in that file, at its line and column (`file`, `line`, `col` in the JSON, and its own file in
  SARIF); a finding of a flake carries its configuration (`config`).
- The page, `evaluate` and the language server decide the target the same way: by what the file says, or
  else where it has fewer errors (NixOS or Home Manager). The command line and the editor used to take
  NixOS whenever the file did not say.
- A value written below an `attrsOf` option is judged by the deepest option that knows its type, and
  attributes written below a list option are a type error.
- Names with dots inside quotes (`services.akkoma.config.":pleroma"."Pleroma.Web.Endpoint".http.port`)
  are one attribute in the catalogs, as they are in the file, instead of being cut at every dot.
- The oracle may miss at most 3 % of the wrong values (it was 7 %).
- GitHub Actions are pinned by commit, and so is devenv.
