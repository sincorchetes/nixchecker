// What the browser tests share: a static server that behaves like GitHub Pages, a browser and the
// "paste, press validate, wait" step.
import { join } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

export const dist = join(import.meta.dir, "..", "dist");

/**
 * Serves a built site the way GitHub Pages does (`/x/` is `/x/index.html`), under `prefix`. While
 * `failing()` is true the catalogs answer with an error, as a network that drops them would; each catalog
 * waits `delay` milliseconds first, as a slow one would.
 */
export function serveSite(
  root: string,
  prefix = "",
  failing: () => boolean = () => false,
  delay = 0,
) {
  const server = Bun.serve({
    // 0: the system gives a free port. A random one in a range can land on one in use, and the whole file fails.
    port: 0,
    async fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname);
      if (delay > 0 && path.includes("/catalog/")) await new Promise((r) => setTimeout(r, delay));
      if (failing() && path.includes("/catalog/")) return new Response("down", { status: 503 });
      if (!path.startsWith(`${prefix}/`)) return new Response("Not found", { status: 404 });
      const local = path.slice(prefix.length);
      const file = Bun.file(join(root, local.endsWith("/") ? `${local}index.html` : local));
      const inside = file.name?.startsWith(root);
      return inside && (await file.exists())
        ? new Response(file)
        : new Response("Not found", { status: 404 });
    },
  });
  return {
    url: (path = "/") => `http://localhost:${server.port}${prefix}${path}`,
    stop: () => server.stop(true),
  };
}

export const chromePath = (): string =>
  process.env.CHROME_BIN ?? Bun.which("google-chrome") ?? Bun.which("chromium") ?? "";

export const launchChrome = (): Promise<Browser> =>
  puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--no-sandbox"] });

/** Waits until no validation is running and a result is shown. */
export const settled = (page: Page) =>
  page.waitForFunction(() => {
    const results = document.getElementById("results");
    return !results?.hasAttribute("aria-busy") && results?.querySelector(".summary");
  });

/** Replaces the text, validates and waits for the (asynchronous) result to settle. */
export async function validateIn(page: Page, source: string) {
  await page.$eval("#source", (el, value) => ((el as HTMLTextAreaElement).value = value), source);
  // Empty the results first, so the wait below cannot be satisfied by the previous run.
  await page.$eval("#results", (el) => el.replaceChildren());
  await page.click("#validate");
  // Validating happens off the page: a run that was left behind may still show its result, so wait for
  // the busy mark of this run to end, not just for a result to appear.
  await settled(page);
}
