// Validates off the page's thread, so a large file never makes the editor stutter.
import { type Request, validateText } from "./analysis";

self.addEventListener("message", async (event: MessageEvent<{ id: number; request: Request }>) => {
  const { id, request } = event.data;
  try {
    self.postMessage({ id, verdict: await validateText(request) });
  } catch {
    // The only thing that fails is a catalog that could not be downloaded.
    self.postMessage({ id, failed: true });
  }
});
