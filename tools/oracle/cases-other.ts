// Home Manager and disko modules for the oracle, like the NixOS ones in cases.ts.
export const HOME_MANAGER_CASES: string[] = [
  // correct
  "{ programs.git.enable = true; }",
  "{ programs.zsh.enable = true; programs.zsh.enableCompletion = true; }",
  "{ programs.bash.enable = true; }",
  "{ home.packages = [ ]; }",
  '{ home.sessionVariables.EDITOR = "vim"; }',
  "{ services.gpg-agent.enable = true; }",
  "{ xdg.enable = true; }",
  "{ programs.neovim = { enable = true; viAlias = true; }; }",
  "{ programs.starship.settings.add_newline = false; }",
  '{ home.file.".foo".text = "x"; }',
  "{ programs.tmux = { enable = true; baseIndex = 1; }; }",
  '{ programs.bat = { enable = true; config.theme = "x"; }; }',
  "{ programs.fzf.enable = true; }",
  // unknown options
  "{ programs.git.enabel = true; }",
  "{ program.git.enable = true; }",
  "{ programs.tmux.baseIndx = 1; }",
  "{ home.pacakges = [ ]; }",
  "{ services.nonexistent.enable = true; }",
  // wrong types
  '{ programs.git.enable = "yes"; }',
  '{ programs.tmux.baseIndex = "one"; }',
  "{ programs.tmux.baseIndex = true; }",
  "{ programs.zsh.enableCompletion = 1; }",
  "{ programs.neovim.viAlias = [ ]; }",
  '{ xdg.enable = "true"; }',
  "{ programs.tmux.terminal = 3; }",
  "{ programs.bat.enable = { }; }",
];

// An option deep in a disko configuration can only be read when the whole chain around it is set.
const DISK = (inner: string) =>
  `{ disko.devices.disk.main = { type = "disk"; device = "/dev/sda"; content = { type = "gpt"; partitions.root = { ${inner} }; }; }; }`;
const FS = (inner: string) => DISK(`size = "100%"; content = { type = "filesystem"; ${inner} };`);

export const DISKO_CASES: string[] = [
  // correct
  DISK('size = "100%"; content = { type = "filesystem"; format = "ext4"; mountpoint = "/"; };'),
  '{ disko.devices.disk.main.device = "/dev/sda"; }',
  '{ disko.devices.disk.main.type = "disk"; }',
  '{ disko.devices.disk.main.content.type = "gpt"; }',
  // unknown options
  '{ disko.devices.disk.main.devise = "/dev/sda"; }',
  '{ disko.devices.disks.main.device = "/dev/sda"; }',
  '{ disko.device.disk.main.device = "/dev/sda"; }',
  FS('format = "ext4"; mountpoin = "/";'),
  // wrong types
  "{ disko.devices.disk.main.device = 5; }",
  "{ disko.devices.disk.main.device = true; }",
  '{ disko.devices.disk.main.type = "floppy"; }',
  "{ disko.devices.disk.main.content.type = 1; }",
  DISK('size = [ "1G" ]; content = { type = "filesystem"; format = "ext4"; mountpoint = "/"; };'),
  FS('format = "fat12"; mountpoint = "/";'),
  FS('format = "ext4"; mountpoint = 1;'),
];
