import { describe, expect, test } from "bun:test";
import { CatalogError } from "../../src/lib/catalog";
import { describeFailure, logFailure } from "./failure";

describe("what the server says when something fails", () => {
  test("a catalog that could not be read is said briefly", () => {
    const said = describeFailure("hover", new CatalogError("x/index.json: HTTP 503"));
    expect(said).toBe("nixchecker-lsp: hover: catalog unavailable: x/index.json: HTTP 503");
  });

  test("any other error is an internal one, with where it came from", () => {
    const said = describeFailure("diagnostics", new TypeError("boom"));
    expect(said).toContain("nixchecker-lsp: diagnostics: internal error: ");
    expect(said).toContain("TypeError: boom");
    expect(said).toContain("failure.test.ts");
    expect(describeFailure("completion", "a string")).toBe(
      "nixchecker-lsp: completion: internal error: a string",
    );
  });

  test("goes to the error output, which is the editor's log", () => {
    const lines: unknown[] = [];
    const error = console.error;
    console.error = (line: unknown) => void lines.push(line);
    try {
      logFailure("hover", new Error("x"));
    } finally {
      console.error = error;
    }
    expect(String(lines[0])).toContain("nixchecker-lsp: hover: internal error: ");
  });
});
