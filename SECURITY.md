# Security policy

Report vulnerabilities privately through GitHub's "Report a vulnerability" button in the
repository's Security tab. Please do not open a public issue.

nixchecker validates Nix code statically in the browser and never evaluates or executes it.
If a future version adds server-side evaluation, it will run in a restricted sandbox and be
documented here.
