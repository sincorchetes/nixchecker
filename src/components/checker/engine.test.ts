import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { CatalogError } from "../../lib/catalog";
import type { Request } from "./analysis";
import { createEngine, InternalError } from "./engine";

// Without a worker the engine runs the job in the page: the same two kinds of failure must come out.
const WorkerKept = globalThis.Worker;
beforeAll(() => {
  // @ts-expect-error a page where a worker cannot start
  globalThis.Worker = undefined;
});
afterAll(() => {
  globalThis.Worker = WorkerKept;
});

const request = (text: unknown): Request => ({
  text: text as string,
  choice: "nixos",
  release: "unstable",
  base: "/never/",
});

describe("engine", () => {
  test("a catalog that cannot be had is a CatalogError, so the page can say it is the connection", async () => {
    const error = await createEngine()(request("{ a = 1; }")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CatalogError);
  });

  test("any other failure is an InternalError, so it is not taken for a connection problem", async () => {
    const error = await createEngine()(request(undefined)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InternalError);
    expect(error).not.toBeInstanceOf(CatalogError);
  });
});
