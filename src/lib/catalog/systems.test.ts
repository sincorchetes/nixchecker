import { expect, test } from "bun:test";
import { DEFAULT_SYSTEM, isDarwin, SYSTEMS } from "./systems";

test("the default system is one of the systems", () => {
  expect(SYSTEMS).toContain(DEFAULT_SYSTEM);
});

test("macOS systems are told from the Linux ones", () => {
  expect(SYSTEMS.filter(isDarwin)).toEqual(["aarch64-darwin", "x86_64-darwin"]);
});
