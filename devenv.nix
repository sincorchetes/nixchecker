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
  # 30 s per test and hook: starting Chrome on a busy CI runner can take longer than Bun's default of 5 s,
  # and a hook that times out takes down every test of its file.
  scripts.e2e.exec = "bun install --frozen-lockfile && bun test --timeout 30000 -c e2e/bunfig.toml ./e2e/*.e2e.ts";
  # Regenerates public/catalog/ from the pinned upstream projects (needs Nix); `--update` moves the pins first.
  scripts.catalog.exec = ''bun tools/catalog/build.ts "$@"'';
  # Is there a NixOS release without a catalog? Takes the files of branch names the workflow lists.
  scripts.releases.exec = ''bun tools/catalog/releases.ts "$@"'';
  # Looks for secrets across the whole git history (gitleaks).
  # Every .nix file in nixpkgs and Home Manager must parse: they are all valid, so a problem is a parser bug.
  scripts.corpus.exec = "bun tools/corpus/run.ts";
  # Damaged copies of those files: our parser and `nix-instantiate --parse` must agree on each one.
  # An optional argument is the sampling step (default 40: one file in 40, six damages each); a second one is the seed.
  scripts.differential.exec = "bun tools/corpus/differential.ts \"$@\"";
  # Modules put to real Nix (the NixOS, Home Manager and disko module systems) and to our validator: hand-written ones and ones
  # made from a sample of the catalog (optional arguments: how many options, the seed, and `all` for every release). They must agree
  # on unknown options and wrong types; false positives are failures, misses are counted.
  # Checks a file with the static analysis and with the real module system of your Nix (needs Nix):
  #   devenv shell -- evaluate my-config.nix --target nixos --release 26.05
  scripts.evaluate.exec = "bun tools/local/check.ts \"$@\"";
  # A Language Server for Nix files (the static layer, as diagnostics while you type), over stdin/stdout.
  # The command line against real Nix, on the cases the unit tests can only imitate (needs Nix).
  scripts.integration.exec = "bun test -c tools/local/integration/bunfig.toml ./tools/local/integration/*.integration.ts ./tools/lsp/*.integration.ts";
  scripts.lsp.exec = "bun tools/lsp/server.ts";
  # `oracle 40 1 only=<group>` runs one group of targets (CI runs them in parallel). The nix.conf check
  # belongs to the full run; CI runs it on its own (`bun tools/oracle/nix-conf.ts`).
  scripts.oracle.exec = ''
    bun tools/oracle/run.ts "$@"
    case " $* " in *" only="*) ;; *) bun tools/oracle/nix-conf.ts ;; esac
  '';
  # Checks that a release tag is the version in package.json (the Release workflow runs it).
  scripts.release-check.exec = "bun tools/release/verify.ts \"$@\"";
  scripts.secrets.exec = "${pkgs.gitleaks}/bin/gitleaks git --config .gitleaks.toml --no-banner --redact --verbose";
  # Sends the code and coverage (coverage/lcov.info, written by `unit`) to SonarQube.
  # Needs SONAR_HOST_URL and SONAR_TOKEN; the project settings are passed here, never committed.
  # Coverage is measured on src/lib; the interface and the tools are exercised by `e2e` and `corpus`.
  # The two message dictionaries repeat the same keys by design, so they are left out of duplication.
  scripts.sonar.exec = ''
    ${pkgs.sonar-scanner-cli}/bin/sonar-scanner \
      -Dsonar.organization="''${SONAR_ORGANIZATION:-sincorchetes}" \
      -Dsonar.projectKey="''${SONAR_PROJECT_KEY:-sincorchetes_nixchecker}" \
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
