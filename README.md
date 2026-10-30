# nixchecker

Paste your `flake.nix` or any Nix file and validate it against the official documentation of
NixOS, Home Manager, disko and Nix flakes.

> **Unofficial project.** nixchecker is not affiliated with or endorsed by the NixOS Foundation,
> Home Manager or disko. It was built with the help of AI: always review the results before
> applying changes to a real system.

## Status

Early prototype. The validator parses the file with its own Nix parser (syntax errors come with
the exact line and column), collects every `a.b.c = value;` assignment and checks it against catalogs generated from the official sources: `nixosOptionsDoc` for NixOS
(~27k options), the Home Manager manual (~6k) and the disko module, plus the flake format.
It reports unknown options with "did you mean" suggestions and the options available there, wrong
value types, renamed options, options hidden from the manuals, and names that are not defined.

The parser is checked against every `.nix` file of nixpkgs and Home Manager (about 49,000), all of
which must parse without a problem: `devenv shell -- corpus`, also run by CI.

Limits to know about:

- It is static: nothing is evaluated, so values built with functions, `mkIf` or `let` are not
  checked, and options defined by modules you import yourself are unknown to it.
- disko documents only its top level; the nested disk layout options come from a hand-written
  overlay (`tools/catalog/overlay.ts`).
- Renamed options are read from the `mkRenamedOptionModule` calls in the nixpkgs and Home Manager
  sources (about 750 for NixOS); the ones that were removed rather than renamed, and the ones
  hidden without a replacement, get a generic warning.

The NixOS and Home Manager catalogs exist per release (26.05, 25.11 and unstable), chosen with the
version selector; disko and flakes have one catalog each.

Validation runs entirely in the browser: your configuration is never uploaded. The catalogs are
sharded (`public/catalog/<target>/`): the browser downloads a small index plus only the shards for
the options your file mentions, typically 20-30 KB gzipped for NixOS instead of the whole catalog
(about 190 KB).

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
Home Manager), `e2e` (browser tests of the built site, needs Chrome), `secrets` (gitleaks) and
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
