# Security policy

Report vulnerabilities privately through GitHub's "Report a vulnerability" button in the
repository's Security tab. Please do not open a public issue.

The web page validates Nix code statically in the browser and never evaluates or executes it, and
the language server (`nixchecker-lsp`) is static too.

The command line is different: `nixchecker` (`evaluate`), unless it is run with `--static`, gives your file to
the Nix evaluator on your machine, to see what the module system says. Evaluating Nix is running code:
a file can read files, import others and, as any Nix expression can, fetch from the network
(`builtins.fetchurl`, flake inputs) or build things while it is evaluated (import from derivation). Run it
on code you would run `nix build` on, and not on a file you do not trust. Flakes are evaluated with their
own inputs, which Nix may download. There is no server-side evaluation, and no plan for one without a
sandbox that has been reviewed.
