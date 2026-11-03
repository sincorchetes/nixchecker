import { describe, expect, test } from "bun:test";
import { diskoEntries, type JsonTypes } from "./disko";

// Two device kinds that nest each other: a disk holds a layout (`content`), and `luks` holds one too.
const types = {
  deviceType: { type: "oneOf", types: ["fs", "luks"] },
  partitionType: { type: "oneOf", types: ["fs"] },
  disk: {
    content: "<deviceType>",
    device: { type: "absolute-pathname" },
    imageSize: { type: "str" },
    type: { type: { type: "enum", choices: ["disk"] } },
  },
  fs: {
    mountpoint: { type: { type: "nullOr", subType: "absolute-pathname" } },
    mountOptions: { type: { type: "listOf", subType: "str" } },
    type: { type: { type: "enum", choices: ["filesystem"] } },
    _create: "_create",
  },
  luks: {
    content: "<deviceType>",
    settings: { type: { type: "attrsOf", subType: "anything" } },
    type: { type: { type: "enum", choices: ["luks"] } },
  },
  mdadm: {},
  zpool: {},
  lvm_vg: {},
  nodev: {},
  bcachefs_filesystem: {},
} as unknown as JsonTypes;

const entries = Object.fromEntries(diskoEntries(types).map((e) => [e.path, e]));
const root = "disko.devices.disk.*";

describe("disko layouts", () => {
  test("options of a type are read with their types", () => {
    expect(entries[`${root}.device`]).toMatchObject({ type: "path" });
    expect(entries[`${root}.content.mountOptions`]).toMatchObject({
      type: "list",
      values: ["str"],
    });
    expect(entries[`${root}.content.mountpoint`]).toMatchObject({ type: "path" });
  });

  test("a place that may hold several types takes all their values", () => {
    expect(entries[`${root}.content.type`]?.values).toEqual(["filesystem", "luks"]);
  });

  test("a free-form set stays free-form, and private options are left out", () => {
    expect(entries[`${root}.content.settings`]).toMatchObject({ type: "attrs" });
    expect(Object.keys(entries).some((path) => path.includes("_create"))).toBe(false);
  });

  test("nesting stops at a depth, leaving the rest free-form", () => {
    expect(entries[`${root}.content.content.content.content`]).toMatchObject({ type: "attrs" });
    expect(entries[`${root}.content.content.content.content.type`]).toBeUndefined();
  });
});

describe("disko layouts that disagree", () => {
  test("a place that is a list in one type and a set in another is left unchecked", () => {
    const mixed = {
      ...types,
      deviceType: { type: "oneOf", types: ["gpt", "table"] },
      gpt: {
        partitions: { type: { type: "attrsOf", subType: { options: { size: { type: "str" } } } } },
      },
      table: {
        partitions: { type: { type: "listOf", subType: { options: { size: { type: "str" } } } } },
      },
    } as unknown as JsonTypes;
    const found = Object.fromEntries(diskoEntries(mixed).map((e) => [e.path, e]));
    expect(found[`${root}.content.partitions`]).toMatchObject({ type: "any" });
    expect(found[`${root}.content.partitions.*.size`]).toMatchObject({ type: "str" });
  });

  test("a place chosen by type is a strict set", () => {
    expect(entries[`${root}.content`]).toMatchObject({ type: "set" });
  });
});
