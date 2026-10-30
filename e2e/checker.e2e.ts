// Browser tests: they drive the built site (`dist/`) in a real Chrome, so they need
// `bun run build` first and a Chrome binary (CHROME_BIN, or google-chrome on the PATH).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

let server: ReturnType<typeof Bun.serve>;
let browser: Browser;
let page: Page;
const port = 4100 + Math.floor(Math.random() * 500);
const url = (path = "/") => `http://localhost:${port}${path}`;

const summary = () => page.$eval(".summary", (el) => el.className);
const messages = () => page.$$eval(".diag .msg", (els) => els.map((el) => el.textContent ?? ""));

// Replaces the text, validates and waits for the (asynchronous) result to settle.
async function validate(source: string) {
  await page.$eval("#source", (el, value) => ((el as HTMLTextAreaElement).value = value), source);
  // Empty the results first, so the wait below cannot be satisfied by the previous run.
  await page.$eval("#results", (el) => el.replaceChildren());
  await page.click("#validate");
  await page.waitForSelector("#results .summary");
}

beforeAll(async () => {
  // Serves `dist/` the way GitHub Pages does: `/x/` is `/x/index.html`.
  const root = join(import.meta.dir, "..", "dist");
  server = Bun.serve({
    port,
    async fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname);
      const file = Bun.file(join(root, path.endsWith("/") ? `${path}index.html` : path));
      const inside = file.name?.startsWith(root);
      return inside && (await file.exists())
        ? new Response(file)
        : new Response("Not found", { status: 404 });
    },
  });
  browser = await puppeteer.launch({
    executablePath:
      process.env.CHROME_BIN ?? Bun.which("google-chrome") ?? Bun.which("chromium") ?? "",
    headless: true,
    args: ["--no-sandbox"],
  });
  page = await browser.newPage();
  await page.goto(url());
});

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
});

describe("checker", () => {
  test("validates the bundled example", async () => {
    await page.click("#example");
    await page.waitForSelector(".diag");
    expect((await messages()).length).toBe(3);
    expect(await summary()).toContain("bad");
  });

  test("accepts a correct file", async () => {
    await validate("{ services.openssh.enable = true; }");
    expect(await summary()).toContain("good");
  });

  test("does not validate while typing, and dims stale results", async () => {
    await page.type("#source", " ");
    expect(await page.$eval("#results", (el) => el.hasAttribute("data-stale"))).toBe(true);
    await page.click("#validate");
    await page.waitForSelector("#results:not([data-stale])");
  });

  test("applies a fix and validates again", async () => {
    await validate("{ services.openssh.enabel = true; }");
    expect((await messages())[0]).toContain("services.openssh.enabel");
    await page.click(".diag .fix");
    await page.waitForSelector(".summary.good");
    expect(await page.$eval("#source", (el) => (el as HTMLTextAreaElement).value)).toBe(
      "{ services.openssh.enable = true; }",
    );
  });

  test("applies every fix at once", async () => {
    await validate(
      "{\n  services.openssh.enabel = true;\n  boot.loader.systemd-boot.enabel = true;\n}",
    );
    await page.click(".results > .fix");
    await page.waitForSelector(".summary.good");
  });

  test("reports a lost semicolon and an undefined name", async () => {
    await validate("{ pkgs }:\n{\nservices.openssh = ena\n}");
    expect((await messages()).length).toBe(2);
  });

  test("warns when there is nothing to check", async () => {
    await validate("lib.mkMerge [ ]");
    expect(await page.$$eval(".diag.warning", (els) => els.length)).toBe(1);
  });

  test("selects the offending word from the line link", async () => {
    await validate("{\n  services.openssh.enabel = true;\n}");
    await page.click(".diag .where");
    const selected = await page.$eval("#source", (el) => {
      const area = el as HTMLTextAreaElement;
      return area.value.slice(area.selectionStart, area.selectionEnd);
    });
    expect(selected).toBe("services.openssh.enabel");
  });

  test("loads only the catalog parts it needs", async () => {
    const files: string[] = [];
    page.on("response", (r) => {
      const [, rest] = r.url().split("/catalog/");
      if (rest) files.push(rest);
    });
    await validate('{ home.stateVersion = "24.11"; }');
    expect(files).toEqual(["home-manager-26.05/index.json", "home-manager-26.05/home.json"]);
  });

  test("validates against the chosen release", async () => {
    const src = "{ programs.atuin.enable = true; }";
    await validate(src);
    expect(await summary()).toContain("good");
    // Changing the release re-validates by itself, against another catalog.
    await page.$eval("#results", (el) => el.replaceChildren());
    await page.select("#version", "25.11");
    await page.waitForSelector("#results .summary");
    expect(await summary()).toContain("bad");
    expect((await messages())[0]).toContain("programs.atuin.enable");
    expect(await page.$eval(".diag .docs", (el) => (el as HTMLAnchorElement).href)).toContain(
      "channel=25.11",
    );
    await page.select("#version", "26.05");
  });

  test("numbers the lines, marks the ones with problems and tracks the cursor", async () => {
    await validate('{\n  services.openssh.enabel = true;\n  networking.hostName = "x";\n}');
    expect(await page.$$eval("#gutter .ln", (els) => els.length)).toBe(4);
    expect(await page.$$eval("#gutter .ln.error", (els) => els.map((e) => e.textContent))).toEqual([
      "2",
    ]);
    await page.focus("#source");
    await page.$eval("#source", (el) => (el as HTMLTextAreaElement).setSelectionRange(14, 14));
    await page.waitForFunction(() =>
      document.querySelector("#cursor")?.textContent?.startsWith("Línea 2"),
    );
    expect(await page.$eval("#cursor", (el) => el.textContent)).toBe("Línea 2, columna 13");
    // Typing moves the lines and clears the marks, which belonged to the old text.
    await page.keyboard.press("Enter");
    expect(await page.$$eval("#gutter .ln", (els) => els.length)).toBe(5);
    expect(await page.$$eval("#gutter .ln.error", (els) => els.length)).toBe(0);
    expect(await page.$eval("#cursor", (el) => el.textContent)).toBe("Línea 3, columna 1");
  });

  test("works in English", async () => {
    await page.goto(url("/en/"));
    await validate("{ services.openssh.enabel = true; }");
    expect((await messages())[0]).toContain("does not exist");
  });
});
