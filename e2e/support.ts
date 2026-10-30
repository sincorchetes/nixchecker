// What the browser tests share: a static server that behaves like GitHub Pages, a browser and the
// "paste, press validate, wait" step.
import { join } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

export const dist = join(import.meta.dir, "..", "dist");

/** Serves a built site the way GitHub Pages does (`/x/` is `/x/index.html`), under `prefix`. */
export function serveSite(root: string, prefix = "") {
  const server = Bun.serve({
    port: 4100 + Math.floor(Math.random() * 500),
    async fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname);
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

/** Replaces the text, validates and waits for the (asynchronous) result to settle. */
export async function validateIn(page: Page, source: string) {
  await page.$eval("#source", (el, value) => ((el as HTMLTextAreaElement).value = value), source);
  // Empty the results first, so the wait below cannot be satisfied by the previous run.
  await page.$eval("#results", (el) => el.replaceChildren());
  await page.click("#validate");
  await page.waitForSelector("#results .summary");
}
