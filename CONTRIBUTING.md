# Contributing

1. Branch from an up-to-date `main`: `git switch -c feat/short-description`.
2. Format and lint: `devenv shell -- fix`, then `devenv shell -- lint`.
3. Run `devenv test`. `src/lib` must keep 100% line coverage, so add a test for every new branch.
   Depending on what you changed, also run the checks that need Nix or a browser (CI runs them all):
   `corpus` and `differential` (the Nix parser), `oracle` (the validator and the catalogs), `catalog`
   (the catalog generator), `integration` (the command line against real Nix) and `e2e` (the page, in
   Chrome).
4. Open a pull request with a conventional commit title (`feat:`, `fix:`, `docs:`...).

Conventions:

- Bun for everything; do not use `npm`.
- Code comments and documentation are in American English.
- Every new user-facing string needs a Spanish source text (`src/lib/i18n/es.ts`) and an English
  translation (`src/lib/i18n/en.ts`); the build fails otherwise.
- Keep the "unofficial project" and "built with AI" notices.

## Automation

`catalog-update.yml` opens a weekly pull request with the regenerated catalogs. The default token of a workflow
cannot start the checks of a pull request, so a GitHub App opens it. To set it up (once, by an owner):

1. Settings → Developer settings → GitHub Apps → New GitHub App. Name it, uncheck Webhook, and give it only the
   repository permissions *Contents: Read and write* and *Pull requests: Read and write*. Install it on this
   repository only.
2. Generate a private key for the App (a `.pem` file).
3. In the repository, Settings → Secrets and variables → Actions: add the variable `CATALOG_APP_CLIENT_ID` (the
   App's Client ID) and the secret `CATALOG_APP_PRIVATE_KEY` (the whole `.pem`). Delete the file afterwards.
4. Run *Update catalogs* once by hand (Actions → Run workflow) and check that the pull request starts the checks.

The branch ruleset must let the App push to `chore/update-catalogs`; `main` stays protected.

## Releases

The site keeps the two newest stable NixOS releases and `unstable`. When a new release is added (the issue that
`new-release.yml` opens lists the steps), the oldest stable one is removed in the same change: its inputs in
`tools/catalog/flake.nix`, its entry in `src/lib/catalog/versions.ts`, its `public/catalog/*-<release>`
directories and the tests that name it. A release that NixOS no longer supports is not worth validating against.
