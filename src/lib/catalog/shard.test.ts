import { describe, expect, test } from "bun:test";
import { toRow } from "./convert";
import { decodeRow } from "./load";
import { BUCKET_ROWS, bucketOf, planner, SPLIT_LIMIT, shardFile, toShards } from "./shard";
import { opt } from "./types";

describe("shards", () => {
  const entries = [
    opt("a", "bool"),
    opt("b", "enum", { values: ["x", "y"] }),
    opt("c", "hidden", { renamedTo: "d" }),
  ];

  test("round-trips entries through the compact row format", () => {
    expect(entries.map(toRow)).toEqual([
      ["a", "bool"],
      ["b", "enum", ["x", "y"]],
      ["c", "hidden", "d"],
    ]);
    const back = entries.map(toRow).map(decodeRow);
    expect(back.map(({ segs, ...e }) => e)).toEqual(entries);
    expect(decodeRow(["x.*.y", "str"]).segs).toEqual(["x", "*", "y"]);
  });

  const big = [
    opt("net.a", "bool"),
    opt("big", "set"),
    opt("big.one.x", "bool"),
    opt("big.one.y", "bool"),
    opt("big.two.x", "bool"),
    opt("big.*.z", "bool"),
  ];

  test("keeps small roots whole and spreads big ones over buckets by second segment", () => {
    const { index, shards } = toShards("src", big, 3, 2);
    expect(index.split).toEqual({ big: { names: ["*", "one", "two"], buckets: 3 } });
    expect(index.keys).toContain("net");
    expect(index.keys).toContain(`big~${bucketOf("one", 3)}`);
    expect(shards.big).toEqual([["big", "set"]]);
    expect(Object.values(shards).flat().length).toBe(big.length);
    expect(toShards("src", big).index.split).toEqual({});
    expect(shardFile("big~1")).toBe("big~1.json");
    expect(bucketOf("one", 3)).toBe(bucketOf("one", 3));
    expect(bucketOf("x", 1)).toBe(0);
    expect(SPLIT_LIMIT).toBeGreaterThan(BUCKET_ROWS);
  });

  test("plans the shards a path needs, falling back to the nearest on typos", () => {
    const plan = planner(toShards("src", big, 3, 2).index);
    const bucket = (name: string) => `big~${bucketOf(name, 3)}`;
    expect(plan(["net", "a"])).toEqual(["net"]);
    expect(plan(["big", "one", "x"])).toEqual(["big", bucket("one")]);
    expect(plan(["big", "tow", "x"])).toEqual(["big", bucket("*")]);
    expect(plan(["bgi", "one"])).toEqual(["big", bucket("one")]);
    expect(plan(["big"])).toEqual(["big"]);
    expect(plan(["zzzzzz", "x"])).toEqual([]);
    const noWild = planner(
      toShards(
        "src",
        big.filter((e) => !e.path.includes("*")),
        3,
        2,
      ).index,
    );
    expect(noWild(["big", "tow"])).toEqual(["big", bucket("two")]);
    expect(noWild(["big", "qqqqqqq"])).toEqual(["big"]);
  });
});
