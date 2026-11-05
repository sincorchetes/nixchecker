import { describe, expect, test } from "bun:test";
import { createProject, isConfigFile } from "./project";

describe("isConfigFile", () => {
  test("Nix files and nix.conf are, wherever they are in the folder", () => {
    expect(isConfigFile("etc/nixos/configuration.nix")).toBe(true);
    expect(isConfigFile("etc/nix/nix.conf")).toBe(true);
    expect(isConfigFile("flake.nix")).toBe(true);
  });

  test("other files, and what tools leave in the folder, are not", () => {
    expect(isConfigFile("etc/README.md")).toBe(false);
    expect(isConfigFile("etc/.git/x.nix")).toBe(false);
    expect(isConfigFile("etc/node_modules/p/default.nix")).toBe(false);
    expect(isConfigFile("etc/result/x.nix")).toBe(false);
  });
});

describe("project", () => {
  test("starts empty, with no current file and nothing else to know about", () => {
    const project = createProject();
    expect(project.names()).toEqual([]);
    expect(project.current()).toBe(-1);
    expect(project.others()).toEqual([]);
  });

  test("adding files gives the index of the first added, and a name already there takes its place", () => {
    const project = createProject();
    expect(
      project.add([
        { name: "a.nix", text: "A" },
        { name: "b.nix", text: "B" },
      ]),
    ).toBe(0);
    expect(
      project.add([
        { name: "c.nix", text: "C" },
        { name: "a.nix", text: "A2" },
      ]),
    ).toBe(2);
    expect(project.names()).toEqual(["a.nix", "b.nix", "c.nix"]);
    expect(project.add([{ name: "b.nix", text: "B2" }])).toBe(1);
    expect(project.add([])).toBe(-1);
  });

  test("selecting keeps what the editor had in the file it leaves, and the others are the rest", () => {
    const project = createProject();
    project.add([
      { name: "a.nix", text: "A" },
      { name: "b.nix", text: "B" },
    ]);
    expect(project.select(0, "ignored: nothing was current")).toBe("A");
    expect(project.current()).toBe(0);
    expect(project.others()).toEqual(["B"]);
    expect(project.select(1, "A edited")).toBe("B");
    expect(project.others()).toEqual(["A edited"]);
    expect(project.select(0, "B edited")).toBe("A edited");
    expect(project.others()).toEqual(["B edited"]);
  });
});
