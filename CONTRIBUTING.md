# Contributing

1. Branch from an up-to-date `main`: `git switch -c feat/short-description`.
2. Format and lint: `devenv shell -- fix`, then `devenv shell -- lint`.
3. Run `devenv test`. `src/lib` must keep 100% line coverage, so add a test for every new branch.
4. Open a pull request with a conventional commit title (`feat:`, `fix:`, `docs:`...).

Conventions:

- Bun for everything; do not use `npm`.
- Code comments and documentation are in American English.
- Every new user-facing string needs a Spanish source text (`src/lib/i18n/es.ts`) and an English
  translation (`src/lib/i18n/en.ts`); the build fails otherwise.
- Keep the "unofficial project" and "built with AI" notices.
