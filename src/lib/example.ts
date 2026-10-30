// Sample configuration with deliberate mistakes, loaded by the "Load example" button.
export const EXAMPLE = `{ config, pkgs, ... }:
{
  networking.hostName = "nixbox";
  networking.firewall.enable = "yes";

  services.openssh.enabel = true;
  services.xserver.displayManager.gdm.enable = true;

  users.users.alice = {
    isNormalUser = true;
    extraGroups = [ "wheel" ];
  };
}
`;
