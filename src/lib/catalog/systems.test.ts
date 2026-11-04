import { expect, test } from "bun:test";
import { DEFAULT_SYSTEM, SYSTEMS } from "./systems";

test("the default system is one of the systems", () => {
  expect(SYSTEMS).toContain(DEFAULT_SYSTEM);
});
