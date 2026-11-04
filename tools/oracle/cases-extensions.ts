// Modules of the projects that add options to NixOS, like the NixOS ones in cases.ts. Each is put to a NixOS
// that has the module of its project added.
export const EXTENSION_CASES: Record<string, string[]> = {
  "sops-nix": [
    // correct
    "{ sops.defaultSopsFile = ./secrets.yaml; }",
    '{ sops.secrets."db/password".owner = "postgres"; }',
    '{ sops.secrets.token = { mode = "0400"; restartUnits = [ "x.service" ]; }; }',
    '{ sops.age.keyFile = "/var/lib/sops-nix/key.txt"; }',
    "{ sops.age.generateKey = true; }",
    // unknown options
    "{ sops.secret.x = 1; }",
    "{ sops.defaultSopsFil = ./secrets.yaml; }",
    '{ sops.secrets.token.ownr = "root"; }',
    // wrong types
    "{ sops.secrets.token.mode = 400; }",
    '{ sops.age.generateKey = "yes"; }',
    "{ sops.secrets.token.restartUnits = true; }",
  ],
  agenix: [
    // correct
    "{ age.secrets.token.file = ./token.age; }",
    '{ age.secrets.token.owner = "root"; }',
    '{ age.identityPaths = [ "/etc/ssh/ssh_host_ed25519_key" ]; }',
    // unknown options
    "{ age.secret.token.file = ./token.age; }",
    "{ age.secrets.token.fiel = ./token.age; }",
    // wrong types
    "{ age.secrets.token.mode = 400; }",
    '{ age.identityPaths = "/etc/key"; }',
    '{ age.secrets.token.symlink = "yes"; }',
  ],
  impermanence: [
    // correct
    '{ environment.persistence."/persist".directories = [ "/var/lib/nixos" ]; }',
    '{ environment.persistence."/persist".files = [ "/etc/machine-id" ]; }',
    '{ environment.persistence."/persist".hideMounts = true; }',
    // unknown options
    '{ environment.persistence."/persist".directoris = [ ]; }',
    '{ environment.persistence."/persist".hideMount = true; }',
    // wrong types
    '{ environment.persistence."/persist".hideMounts = "yes"; }',
    '{ environment.persistence."/persist".directories = "/var"; }',
    '{ environment.persistence."/persist".files = true; }',
  ],
};
