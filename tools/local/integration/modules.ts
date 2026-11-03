// The modules the integration tests of the command line are run on, written in a directory of their own.
import { join } from "node:path";

/** Writes the modules and returns `write`, which adds more to the same directory. */
export async function writeModules(dir: string) {
  const write = (name: string, text: string) => Bun.write(join(dir, name), text);
  // A module of the user's that declares an option of its own, and one that sets it.
  await write(
    "mine.nix",
    `{ lib, ... }: { options.my.greeting = lib.mkOption { type = lib.types.str; default = "hi"; }; }\n`,
  );
  await write(
    "uses-mine.nix",
    `{ ... }: {\n  imports = [ ./mine.nix ];\n  my.greeting = "hello";\n}\n`,
  );
  // A module that imports another with a value of the wrong type in it.
  await write("child.nix", `{ ... }: {\n  networking.hostName = 5;\n}\n`);
  await write("parent.nix", `{ ... }: {\n  imports = [ ./child.nix ];\n}\n`);
  // Two wrong values in one module: Nix stops at the first, and the report must have both.
  await write(
    "two-wrong.nix",
    `{ ... }: {\n  networking.hostName = 5;\n  services.openssh.ports = "x";\n  services.openssh.enable = true;\n}\n`,
  );
  // An option that does not exist next to two wrong values: Nix stops at the one that does not exist.
  await write(
    "mixed.nix",
    `{ ... }: {\n  networking.hostName = 5;\n  services.openssh.enabel = true;\n  services.openssh.ports = "x";\n}\n`,
  );
  // A module that writes its options under `config`, as modules with `options` do.
  await write(
    "wrapped.nix",
    `{ lib, ... }: {\n  imports = [ ];\n  config = {\n    networking.hostName = 5;\n  };\n}\n`,
  );
  await write("good.nix", `{ ... }: {\n  networking.hostName = "box";\n}\n`);
  return write;
}
