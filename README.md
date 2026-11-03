# nixchecker

Paste your `flake.nix` or any Nix file and validate it against the official documentation of
NixOS, Home Manager, disko and Nix flakes.

> **Unofficial project.** nixchecker is not affiliated with or endorsed by the NixOS Foundation,
> Home Manager or disko. It was built with the help of AI: always review the results before
> applying changes to a real system.

## Status

In active development; not for anything that cannot be checked twice. The validator parses the file with its own Nix parser (syntax errors come with
the exact line and column), collects every `a.b.c = value;` assignment and checks it against catalogs generated from the official sources: `nixosOptionsDoc` for NixOS
(~27k options), the Home Manager manual (~6k) and the disko module, plus the flake format.
It reports unknown options with "did you mean" suggestions and the options available there, wrong
value types, renamed options, options hidden from the manuals, and names that are not defined.

The parser is checked against every `.nix` file of nixpkgs and Home Manager (about 49,000), all of
which must parse without a problem: `devenv shell -- corpus`, also run by CI. A second check damages
sampled files (cuts, a lost character, a stray symbol) and requires our parser and the official
`nix-instantiate --parse` to agree on whether each one is valid: `devenv shell -- differential`.

## Checking a whole configuration with real Nix

The page only analyzes text. For what needs evaluation (`imports`, `mkIf`, `mkMerge`, priorities,
the assertions of the system), run the file through the module system of your own Nix:

```sh
devenv shell -- evaluate my-config.nix --target nixos --release 26.05
```

It prints the static findings and then what Nix itself says, each marked by how sure it is
(`syntax`, `static check`, `confirmed by Nix`), and exits with 1 when something is an error. When Nix
accepts the module, the static findings it settles are dropped. Files named in `imports` are read from
where they are, so a configuration split over several files works, and an error in an imported module
is reported in that file, at its line and column.

- Name several files or directories (searched for `.nix` files) to check them in one run.
- A `flake.nix` is evaluated with its own inputs: every `nixosConfigurations` and
  `homeConfigurations` entry (it needs a `flake.lock`).
- `--partial` is for a file that is part of a system, not all of it: only the options it sets are
  read, so the assertions of a whole system (root file system, boot loader) do not get in the way.
- `--target` is `nixos`, `home-manager` or `disko`; `--release` picks the pinned nixpkgs and Home
  Manager (or give `--nixpkgs DIR --home-manager DIR`); `--static` skips the evaluation.
- `--format json` (or `--json`) prints the findings as data, `{ "schemaVersion": 1, "results": [...] }` with one result per file, each
  with its coverage and the revisions of the catalog used; `--format sarif` prints SARIF 2.1.0 for code scanning annotations.

Nothing is uploaded: it all runs on your machine. Nix stops at the first error it meets, so fix it and
run again to see the next.

### In your editor

`devenv shell -- lsp` starts a Language Server (stdio) that publishes the static findings as diagnostics
while you type, over the word each one is about: wrong types, unknown options, syntax errors. Point any
LSP client at it for `nix` files. Options go in `initializationOptions`:
`{ "target": "nixos", "release": "unstable" }` (the target is detected when left out). Where a finding has a fix that
is certain (a misspelled option, a renamed one), the editor offers it as a quick fix, one small edit.
It also completes option names from the catalog as you type them (after a `.`, at the start of a
statement, and inside `x.y = { ... }`, with the type of each option), but not in values, strings or
comments. On hover it shows the option's type, what it was renamed to, and a link to its official
page (the catalogs keep no descriptions). It does not run Nix: use `evaluate` for that.

For example, in Neovim (checked with 0.12), from this repository:

```lua
vim.lsp.start({
  name = "nixchecker",
  cmd = { "devenv", "shell", "--", "lsp" },
  root_dir = "/path/to/nixchecker",
  init_options = { target = "nixos" },
})
```

Limits to know about:

- The page is static: nothing is evaluated, so values built with functions, `mkIf` or `let` are not
  checked, and options defined by modules you import yourself are unknown to it. The command above
  settles those with real Nix.
- disko's manual documents only its top level; the nested options of the disk layouts are read from
  disko's own serialized types (`tools/catalog/disko.ts`). Where a place may hold several layout types
  (`content`) the options of all of them are accepted there, and layouts nested more than four deep are
  not read.
- For a flake, `evaluate` evaluates its `nixosConfigurations` and `homeConfigurations` only. It does not
  evaluate `checks`, `packages`, `devShells` or any other output: a flake that passes is not a flake
  whose every output builds.
- Renamed options are read from the `mkRenamedOptionModule` calls in the nixpkgs and Home Manager
  sources (about 750 for NixOS); the ones that were removed rather than renamed, and the ones
  hidden without a replacement, get a generic warning.

`public/catalog/manifest.json` records the revision each catalog was generated from and the hash of
every file in it; a test checks that the files are the ones it lists.

The NixOS and Home Manager catalogs exist per release (26.05, 25.11 and unstable), chosen with the
version selector; disko and flakes have one catalog each.

Validation runs entirely in the browser: your configuration is never uploaded. The catalogs are
sharded (`public/catalog/<target>/`): the browser downloads a small index plus only the shards for
the options your file mentions, typically 20-30 KB gzipped for NixOS instead of the whole catalog
(about 190 KB).

The analysis runs in a Web Worker, so a large file does not stall the editor (where a worker cannot
start, the page does the same work itself). A service worker (`public/sw.js`) keeps a copy of the page
and of the catalog files it used, so after one visit it also opens and validates with no connection;
the network always comes first, so an update is never hidden by an old copy.

### Regenerating the catalogs

```sh
devenv shell -- catalog   # needs Nix; rewrites public/catalog/
devenv shell -- catalog --update   # first moves the pinned upstream versions to the latest
```

Versions are pinned in `tools/catalog/flake.lock`; a new release is a new input pair in `flake.nix` plus an entry in
`src/lib/catalog/versions.ts`. CI checks that the committed catalogs are what the
pins generate, and a daily canary regenerates them from the latest upstream and runs the tests.

## Stack

Astro, Bun and TypeScript, with everything run through [devenv](https://devenv.sh). The site is
bilingual (Spanish and English). It is a static site published with GitHub Pages.

## Development

```sh
devenv shell -- dev     # dev server
devenv shell -- fix     # format and lint with safe fixes (Biome)
devenv test             # lint, types, unit tests (100% line coverage gate) and site build
```

Other scripts: `check`, `lint`, `unit`, `site-build`, `start`, `catalog`, `corpus` (the parser against nixpkgs and
Home Manager), `differential` (the parser against the official one on damaged files), `evaluate` (a file against real Nix), `oracle` (the validator against
the real NixOS, Home Manager and disko module systems, on written and generated modules), `e2e` (browser tests of the built site, needs Chrome), `secrets` (gitleaks) and
`sonar`.

## Deployment (GitHub Pages)

Merging into `main` runs `deploy.yml`, which builds the site and publishes it to GitHub Pages at
<https://nixchecker.sincorchetes.tech> (`public/CNAME` carries the custom domain). One-time setup:

1. Settings → Pages → Source: **GitHub Actions**, and set the custom domain there too.
2. DNS: a `CNAME` record for `nixchecker` pointing at `sincorchetes.github.io`.
3. Enable "Enforce HTTPS" once the certificate is issued.

Builds default to that origin; set the repository variables `PAGES_SITE` and `PAGES_BASE` to publish
elsewhere (for example under `/<repository>/` without a custom domain).

## License

GPL-3.0-or-later. See [LICENSE](LICENSE) and [CREDITS.md](CREDITS.md).
