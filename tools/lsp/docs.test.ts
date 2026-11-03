import { describe, expect, test } from "bun:test";
import { bundleFor, describeDoc } from "./docs";
import { hoverAt } from "./hover";

describe("what the manuals say of an option", () => {
  test("the description without the roles, the default and the example as written", () => {
    const lines = describeDoc({
      description: "Whether to enable the {option}`services.x` daemon, see {manpage}`x(8)`.",
      default: { _type: "literalExpression", text: "false" },
      example: [22, 2222],
    });
    expect(lines).toEqual([
      "Whether to enable the `services.x` daemon, see `x(8)`.",
      "Default: `false`",
      "Example: `[22,2222]`",
    ]);
  });

  test("long text is cut, and nothing is said of what is missing", () => {
    const [description, defaultLine] = describeDoc({
      description: "a".repeat(2000),
      default: { text: "b".repeat(500) },
    });
    expect(description?.length).toBe(901);
    expect(defaultLine?.length).toBeLessThan(260);
    expect(describeDoc({})).toEqual([]);
  });

  test("which bundle documents which target and release", () => {
    expect(bundleFor("nixos", "unstable")).toBe("nixos-unstable");
    expect(bundleFor("nixos", "26.05")).toBe("nixos-2605");
    expect(bundleFor("home-manager", "25.11")).toBe("home-manager-2511");
    expect(bundleFor("disko", "26.05")).toBe("disko");
    expect(bundleFor("flake", "26.05")).toBeUndefined();
  });
});

describe("the hover with the manuals' words", () => {
  const text = "{ services.openssh.enable = true; }";
  const docs = () =>
    new Map([
      [
        "services.openssh.enable",
        {
          description: "Whether to enable {option}`sshd`.",
          default: { text: "false" },
          example: true,
        },
      ],
    ]);

  test("adds the description, the default and the example once they are read", async () => {
    const shown = await hoverAt(text, 22, "nixos", "26.05", docs);
    expect(shown?.value).toContain("Whether to enable `sshd`.");
    expect(shown?.value).toContain("Default: `false`");
    expect(shown?.value).toContain("Example: `true`");
    // ...before the link, which stays last.
    expect(shown?.value.trim().endsWith(")")).toBe(true);
  });

  test("says what it knows while they are not read yet", async () => {
    const shown = await hoverAt(text, 22, "nixos", "26.05", () => undefined);
    expect(shown?.value).toContain("Type: `bool`");
    expect(shown?.value).not.toContain("Default");
  });
});
