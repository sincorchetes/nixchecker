{ pkgs, ... }:

{
  languages.javascript = {
    enable = true;
    bun.enable = true;
  };

  packages = [ pkgs.biome ];

  env.ASTRO_TELEMETRY_DISABLED = "1";

  # Every script below is what CI runs too: `devenv shell -- <script>`.
  scripts.dev.exec = "bun install --frozen-lockfile && bun run dev";
  scripts.check.exec = "bun run check";
  scripts.lint.exec = "biome check . && bun tools/lint/max-lines.ts";
  scripts.fix.exec = "biome check --write .";
  scripts.unit.exec = "bun test";
  scripts.site-build.exec = "bun install --frozen-lockfile && bun run build";
  scripts.start.exec = "bun run start"; # previews the built site
  # Drives the built site (`dist/`) in Chrome: run `site-build` first. CHROME_BIN overrides the binary.
  scripts.e2e.exec = "bun install --frozen-lockfile && bun test -c e2e/bunfig.toml ./e2e/checker.e2e.ts";
  # Regenerates public/catalog/ from the pinned upstream projects (needs Nix); `--update` moves the pins first.
  scripts.catalog.exec = ''bun tools/catalog/build.ts "$@"'';
  # Looks for secrets across the whole git history (gitleaks).
  # Every .nix file in nixpkgs and Home Manager must parse: they are all valid, so a problem is a parser bug.
  scripts.corpus.exec = "bun tools/corpus/run.ts";
  # Damaged copies of those files: our parser and `nix-instantiate --parse` must agree on each one.
  # An optional argument is the sampling step (default 40: one file in 40, three damages each).
  scripts.differential.exec = "bun tools/corpus/differential.ts \"$@\"";
  scripts.secrets.exec = "${pkgs.gitleaks}/bin/gitleaks git --no-banner --redact --verbose";
  # Sends the code and coverage (coverage/lcov.info, written by `unit`) to SonarQube.
  # Needs SONAR_HOST_URL and SONAR_TOKEN; the project settings are passed here, never committed.
  # Coverage is measured on src/lib; the interface and the tools are exercised by `e2e` and `corpus`.
  # The two message dictionaries repeat the same keys by design, so they are left out of duplication.
  scripts.sonar.exec = ''
    ${pkgs.sonar-scanner-cli}/bin/sonar-scanner \
      -Dsonar.projectKey=nixchecker \
      -Dsonar.sources=src,tools \
      -Dsonar.tests=e2e \
      -Dsonar.exclusions='**/*.test.ts,public/catalog/**' \
      -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info \
      -Dsonar.coverage.exclusions='src/components/**,src/pages/**,src/layouts/**,tools/**' \
      -Dsonar.cpd.exclusions='src/lib/i18n/**' \
      "$@"
  '';

  enterTest = ''
    echo "==> Installing dependencies"
    bun install --frozen-lockfile
    echo "==> Lint"
    biome check . && bun tools/lint/max-lines.ts
    echo "==> Type check"
    bun run check
    echo "==> Unit tests (100% line coverage gate)"
    bun test
    echo "==> Site build"
    bun run build
  '';
}
