// Validates off the page's thread, so a large file never makes the editor stutter.
import { CatalogError } from "../../lib/catalog";
import { type Request, validateText } from "./analysis";

self.addEventListener("message", async (event: MessageEvent<{ id: number; request: Request }>) => {
  const { id, request } = event.data;
  try {
    self.postMessage({ id, verdict: await validateText(request) });
  } catch (error) {
    if (error instanceof CatalogError) return self.postMessage({ id, failed: "catalog" });
    // Not a catalog that could not be downloaded: a bug of ours, which is not to look like a network problem.
    console.error("nixchecker: internal error while validating", error);
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ id, failed: "internal", message });
  }
});
