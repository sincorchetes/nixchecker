// The command line against real Nix on a part of a system (`--partial`): every wrong value of a file,
// the ones under `config`, and what a whole system adds. `devenv shell -- integration` (needs Nix).
import { beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { writeModules } from "./modules";
import { evaluate, scratch } from "./support";

const TIME = 900_000;
let dir: string;

// The lines of the findings that have one (the assertions of a whole system have none), in order.
const linesOf = (items: Array<{ line?: number }>) =>
  items.flatMap((i) => (i.line === undefined ? [] : [i.line])).sort((a, b) => a - b);

beforeAll(async () => {
  dir = await scratch();
  await writeModules(dir);
});

describe("more than the first error", () => {
  test(
    "with --partial, every wrong value is confirmed by Nix in one run",
    async () => {
      const run = await evaluate(
        "--format",
        "json",
        "--partial",
        "--target",
        "nixos",
        join(dir, "two-wrong.nix"),
      );
      const confirmed = run.items.filter((i) => i.level === "evaluation");
      expect(confirmed.map((i) => i.line)).toEqual([2, 3]);
      expect(confirmed.map((i) => i.message).join("\n")).toContain("services.openssh.ports");
      // What Nix confirmed is not also shown as a static guess at the same place.
      expect(run.items.filter((i) => i.level === "static")).toEqual([]);
    },
    TIME,
  );
});

describe("a file with many wrong values", () => {
  test(
    "has every one confirmed by Nix, none left out",
    async () => {
      const names =
        "mtr tmux zsh fish nano vim mosh htop iftop iotop java less neovim starship git xonsh nm-applet bandwhich wireshark firejail".split(
          " ",
        );
      const file = join(dir, "twenty-wrong.nix");
      await Bun.write(
        file,
        `{\n${names.map((n) => `  programs.${n}.enable = "yes";`).join("\n")}\n}\n`,
      );
      const run = await evaluate("--format", "json", "--partial", "--target", "nixos", file);
      const confirmed = run.items.filter((i) => i.level === "evaluation");
      expect(confirmed.map((i) => i.line)).toEqual(names.map((_, n) => n + 2));
      expect(run.items.filter((i) => i.level === "static")).toEqual([]);
    },
    TIME,
  );
});

describe("options written under config", () => {
  test(
    "are found, and placed where they are written",
    async () => {
      const run = await evaluate(
        "--format",
        "json",
        "--partial",
        "--target",
        "nixos",
        join(dir, "wrapped.nix"),
      );
      expect(run.code).toBe(1);
      expect(run.items).toHaveLength(1);
      expect(run.items[0]).toMatchObject({ level: "evaluation", line: 4, col: 5 });
    },
    TIME,
  );

  test(
    "are checked statically too",
    async () => {
      const run = await evaluate(
        "--format",
        "json",
        "--static",
        "--target",
        "nixos",
        join(dir, "wrapped.nix"),
      );
      expect(run.items).toMatchObject([
        { level: "static", code: "type-mismatch", line: 4, col: 5 },
      ]);
    },
    TIME,
  );
});

describe("an option that does not exist does not hide the wrong values", () => {
  test(
    "with --partial, it and every wrong value are confirmed in one run",
    async () => {
      const run = await evaluate(
        "--format",
        "json",
        "--partial",
        "--target",
        "nixos",
        join(dir, "mixed.nix"),
      );
      const confirmed = run.items.filter((i) => i.level === "evaluation");
      expect(linesOf(confirmed)).toEqual([2, 3, 4]);
      const text = confirmed.map((i) => i.message).join("\n");
      expect(text).toContain("services.openssh.enabel does not exist");
      expect(text).toContain("networking.hostName");
      expect(text).toContain("services.openssh.ports");
    },
    TIME,
  );
});

describe("a whole system", () => {
  test(
    "also reports every wrong value in one run, and the assertions wait",
    async () => {
      const run = await evaluate(
        "--format",
        "json",
        "--target",
        "nixos",
        join(dir, "two-wrong.nix"),
      );
      const confirmed = run.items.filter((i) => i.level === "evaluation");
      expect(linesOf(confirmed)).toEqual([2, 3]);
      const text = confirmed.map((i) => i.message).join("\n");
      expect(text).toContain("networking.hostName");
      expect(text).toContain("services.openssh.ports");
      // The root file system and the boot loader are behind the wrong values, and not said yet.
      expect(text).not.toContain("fileSystems");
    },
    TIME,
  );
});

describe("a part of a system", () => {
  test(
    "with --partial, only what the file sets is read",
    async () => {
      const run = await evaluate(
        "--format",
        "json",
        "--partial",
        "--target",
        "nixos",
        join(dir, "good.nix"),
      );
      expect(run.items).toEqual([]);
      expect(run.code).toBe(0);
    },
    TIME,
  );

  test(
    "without it, the assertions of a whole system are part of the answer",
    async () => {
      const run = await evaluate("--format", "json", "--target", "nixos", join(dir, "good.nix"));
      expect(run.code).toBe(1);
      expect(run.items.map((i) => i.message).join("\n")).toContain("fileSystems");
    },
    TIME,
  );

  test(
    "with --partial, a wrong value is still found",
    async () => {
      const run = await evaluate(
        "--format",
        "json",
        "--partial",
        "--target",
        "nixos",
        join(dir, "child.nix"),
      );
      expect(run.code).toBe(1);
      expect(run.items[0]).toMatchObject({ level: "evaluation", line: 2, col: 3 });
    },
    TIME,
  );
});
