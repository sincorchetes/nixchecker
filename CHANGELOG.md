# Changelog

All notable changes to nixchecker. The format follows [Keep a Changelog](https://keepachangelog.com);
versions are the `v0.0.N` tags, each published as a GitHub Release with its notes.

## Unreleased

### Changed
- A setting of `nix.conf` that Nix does not know is a warning, not an error, as it is for Nix: it no longer fails the
  command line's exit status.

### Added
- lanzaboote (`boot.lanzaboote`, 41 options) as an extension of NixOS. stylix is left out on purpose: its module is a
  function of its own flake's inputs, so it cannot be put to the oracle, and a catalog nothing checks is not shipped;
  nixos-hardware only has profiles, no options.
- The Home Manager module of sops-nix has its catalog (`ext-sops-nix-home`), loaded on top of Home Manager's when a file
  writes below `sops`; the extensions now belong to the target they extend.
- The "System" selector offers only the systems that suit the target: Macs for nix-darwin, Linux for NixOS and disko.
- Extensions of NixOS: sops-nix, agenix and impermanence each have a catalog with only the options they add, loaded on top
  of the NixOS one when a file writes below `sops`, `age` or `environment.persistence`. Their options are known and typed,
  link to the project's documentation, and are listed in the report's source. The oracle holds them to a real NixOS with
  the module added. The catalog generator finds its inputs through the lock's root, so a new input that brings its own
  `nixpkgs` cannot make it read the wrong revision.
- `nix.conf`: a target on the page and `--target nix-conf` on the command line (a `nix.conf` found in a directory is checked
  too). The settings come from `nix config show --json`; the page tells a `nix.conf` from Nix by its shape, a line that
  is not `name = value` is a syntax error where it is, and the oracle compares the validator with the real `nix` on
  every setting (439 lines, no disagreement).
- nix-darwin: a catalog per release (26.05, 25.11 and unstable, ~1.5k options each), a "nix-darwin" target on the page and
  `--target nix-darwin` on the command line, evaluated by Nix for a Mac (`aarch64-darwin` or `x86_64-darwin`) from any
  machine, and checked by the oracle. `homebrew` and `launchd` in a file point at it when the target is detected.
- `--system` for the command line and a "System" selector in the page (`x86_64-linux`, `aarch64-linux`). The
  evaluation used to be fixed to `x86_64-linux`; the options are identical on both systems (32,558 in NixOS 26.05),
  so there is still one catalog.
- The finding cards settle into place from a few pixels below as the list is scrolled (CSS scroll-driven animation: no
  fading, nothing hidden), only in browsers that support it and not with "reduce motion".

- The weekly catalog pull request is opened by a GitHub App (a one-hour token for this repository, `CATALOG_APP_CLIENT_ID`
  and `CATALOG_APP_PRIVATE_KEY`) instead of a personal token, with the steps to create it in `CONTRIBUTING.md`; and a
  policy for old releases: the two newest stable ones and `unstable`, the oldest retired when a new one is added.
  A language server change now voids the analysis under way at once, not when the wait for the next one ends.
- A text that cannot be validated says why, apart from a catalog that cannot be downloaded: a bug of ours is now an
  "internal error" with its own message and a log line (in the page, and in the language server's output), where
  every failure used to read as a connection problem. The language server analyzes a document once the typing
  pauses (150 ms), not on each keystroke, and not a document that was closed meanwhile.
- The flake evaluates for every platform it declares (`nix flake check --all-systems --no-build` runs in the CI):
  `x86_64-darwin` is out, as nixpkgs dropped it with 26.11; the apps have a description and no longer use the
  deprecated `pkgs.system`.
- A pass over the wording, in both languages: the headline says "your Nix configuration", the message for a file
  that is not a module is plainer, "Remember on this device" is "Save draft on this device", the hint about renamed
  options and the file-size message read more naturally, and a few labels are more direct ("Example diagnostic:",
  "Results panel width", "{n} with unrestricted types").
- A vertical line in the editor marks column 100, where `nixfmt` wraps lines by default; it moves with the text when
  it scrolls sideways, and the cursor's position turns amber past it. To make room for it the page is a little
  wider (84rem) and the editor's type a little smaller, and the findings start at 28% of the width.
- The bar between the editor and the findings can be dragged, or moved with the arrow keys (Home and End go to the
  ends, Enter or a double click puts it back). It is a window splitter for assistive technology, stays between a
  fifth of the width and three fifths (and never below 20rem), and the width is kept in this browser.
- A narrow screen has two views, the editor and the problems (with their number on the button): validating on
  purpose shows the problems, a finding's position takes you back to its word, and validating by itself while
  typing moves nothing. The header takes less room there.
- The validation always says where it stands, beside the Validate button: "Validating…" (when it takes a
  moment), the counts, "No problems" or "Previous result" once the text changed.
- Results: the summary and the findings come first; the target, the catalog and the coverage are under a
  folded "Details". A clean result says "No problems", with what it does not guarantee as a plain note.
- "Clear", "Load example" and opening a file can be undone, until the next edit.
- Two weekly workflows keep the catalogs current: `catalog-update.yml` opens a pull request with the catalogs
  regenerated from the latest upstream (they were only checked daily, never updated), and `new-release.yml` opens an
  issue when nixpkgs has a NixOS release the site has no catalog for. `devenv shell -- releases` is the check.
- A button in the header switches between the light and the dark theme. Without a choice the page follows the
  system; the choice is kept in this browser (only that) and applied before the first paint.
- The editor is one frame, as in a code editor: the actions (open, download the report, clear, load the example,
  validate) are its toolbar, and the target, the version, "remember" and the cursor position are its status bar.
  The sentence about pasting a file is the subtitle of the title.
- The editor and the findings are one workbench: the editor takes the height the window leaves, and what was found sits beside it and scrolls on its own, so nothing needs a scroll of the page.
  Resting the pointer on an underlined word shows what it says, with the suggestion, as an editor does. On
  narrow screens the findings go below the editor.
- A new look for the site: a listing of code with a proofreader's marks. Each finding shows its line with the
  wrong word highlighted and carets under it, as a compiler does; the headline, the example and the results
  share that language. Light and dark follow the system; Bricolage Grotesque and JetBrains Mono replace Inter
  and Outfit; the hexagons, the glass cards, the numbered cards and the closing banner are gone. The counts
  agree with the number ("1 warning"), a long option name wraps instead of widening the page, and fonts are
  served as files, which the page's content policy allows.
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
  or a string with `${...}` in it, which could be one, is let through. A set written out is a package
  only if it says `type = "derivation"`: `package = { }` is an error, `pkgs.hello // { ... }` is not.
- disko's layouts are read down to six levels of `content`, and below each device only what its types
  declare exists (the manual described hooks under `nodev` that the module does not have).
- The oracle does not count a case it could only read one level deep and found no type error in: the
  elements of a list were not looked at, so that says nothing.
- `evaluate` of a whole system also finds every wrong value in one run: when Nix stops at the first, the options of
  the file are read one by one as well and what they add is merged. (The assertions of the system wait
  until the values are right.)
- Strings that must match a pattern (`strMatching`: host names, unit names...) are checked against it, with the
  POSIX classes of Nix read as JavaScript reads them (a pattern that cannot be read is not judged), and the
  elements of a list of paths must be absolute. The oracle no longer lets through any of the wrong values of
  `systemd.*.conflicts` or `app_service_config_files`. The catalogs grow by under 2 %.
- A renamed option whose new name is a key of an `attrsOf` is held to what its values may be. The oracle has a
  `renamed` mode that tries every renamed option: 0 false positives over the 735 of NixOS and the 18 of Home
  Manager, and 13 % of the wrong values of NixOS let through (new names that are free-form, hidden or unlisted).
- The part of the catalog a renamed option points to is downloaded too, even when it is another shard (up to four renames
  deep): `security.initialRootPassword = 5` is a type error, not only "deprecated". The oracle samples renamed options.
- A value written for a renamed option is held to the type of the option it was renamed to (`xdg.userDirs.publishShare = 1` was only "deprecated").
- The elements of a list that is an `enum` of strings are held to those strings (`programs.browserpass.browsers`).
- `nixpkgs.overlays` takes functions, and a user's `home` an absolute path (`passwdEntry path`); the oracle has
  hand-written cases for both, valid and not.
- The type a value is coerced from (`coercedTo`) is read shallowly: Nix only asks whether it is a list, so the elements of
  `extraCreateArgs = [ 1 ]` are not wrong (a false positive of the oracle, found on a sample of 150 options).
- `meta.maintainers` and `meta.teams` (they turn up under the submodules of many options) take sets, not strings or integers.
- No wrong value is left unconfirmed for lack of room: the cap of ten extra options read apart is gone (they are
  read four at a time), and an integration test has twenty wrong values, all confirmed by Nix.
- A file with no expression in it (empty, or only comments) is a syntax error in the CLI, as Nix says; the
  text output says what a misspelled option probably was; a list says which of its elements do not fit
  (`list with str elements`); an option removed or renamed upstream is placed where it is written.
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
- `SECURITY.md` says what the command line does that the page does not: evaluate Nix code on your machine.
- The command line against real Nix on an own module, an error in an imported file, `--partial` with
  and without the assertions of a whole system, and a flake with NixOS and Home Manager configurations
  (`integration`); its SARIF against the official SARIF 2.1.0 schema (OASIS).
- Browser tests in Chrome and Firefox, with axe-core on every state of the page, in both languages and
  color schemes.

### Fixed

- A file that was not told what it is and has no key that is, or is close to, an option (a library, a package, an
  overlay) gets one warning, "it does not look like a module", instead of an error on each key. A misspelling
  is still an error, and so is anything under a kind that was chosen. On the 666 modules of nixpkgs under
  `services/networking`, `programs` and `config` the errors went from 98 to none.
- The catalogs include the internal options (`system.path`, `networking.proxy.envVars`...), which the manuals
  leave out: they were reported as options that do not exist. They are hidden options now (a warning).
- `assertions`, `warnings` and `meta` (`meta.doc`, `meta.maintainers`...), internal options that every module of
  your own may set and that the manuals leave out, were reported as options that do not exist.
- Options written under `config` (`config = { a.b = 1; }`, `config.a.b = 1;`) are the same options as without
  it: the page, `evaluate` and the language server check them, place them and complete them. They were
  left unchecked, and a finding of Nix about them had no line.
- The language server no longer dies of a message it cannot handle: it answers with an error and goes on.
- `evaluate` on a path that does not exist says so in one line (exit status 2) instead of a stack trace.
- `evaluate` no longer says "Nix stops at the first error" when Nix was not asked (`--static`) or when it
  reads the file option by option (`--partial`).
- A flake is read as Nix reads a directory: in a Git repository only the tracked files. It used `path:`,
  which copied the whole directory (untracked files and secrets too) into the Nix store.
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
- The oracle may miss at most 2 % of the wrong values (it was 7 %).
- GitHub Actions are pinned by commit, and so is devenv.
