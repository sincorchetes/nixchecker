// What the server says on its error output (the editor shows it in its log) when something fails behind a
// request. A catalog that could not be read is expected and said briefly; any other error is a bug and is
// said with where it came from, so it can be found. Neither one stops the server or flags the file.
import { CatalogError } from "../../src/lib/catalog";

export function describeFailure(what: string, error: unknown): string {
  if (error instanceof CatalogError)
    return `nixchecker-lsp: ${what}: catalog unavailable: ${error.message}`;
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  return `nixchecker-lsp: ${what}: internal error: ${detail}`;
}

export const logFailure = (what: string, error: unknown): void =>
  console.error(describeFailure(what, error));
