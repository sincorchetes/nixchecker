// What can go wrong around the happy path: a failing network, a site served from a sub-path, a big
// file, a phone, the keyboard, assistive technology and another browser engine.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import puppeteer, { type Browser } from "puppeteer-core";
import { dist, launchChrome, serveSite, validateIn } from "./support";

const root = join(import.meta.dir, "..");
const subDist = join(root, "dist-base");
const sub = serveSite(subDist, "/nixchecker");
const site = serveSite(dist);
let browser: Browser;

beforeAll(async () => {
  // The same site built for a project page: every address has to follow the base.
  const build = Bun.spawn(["bunx", "astro", "build", "--outDir", subDist], {
    cwd: root,
    env: { ...process.env, BASE: "/nixchecker/" },
    stdout: "ignore",
    stderr: "inherit",
  });
  expect(await build.exited).toBe(0);
  browser = await launchChrome();
}, 120_000);

afterAll(async () => {
  await browser?.close();
  site.stop();
  sub.stop();
  await Bun.$`rm -rf ${subDist}`.quiet();
});

// A page in a context of its own, so no cache or storage leaks in from another test.
async function freshPage() {
  const context = await browser.createBrowserContext();
  return context.newPage();
}

describe("robustness", () => {
  test("says so when the catalog cannot be downloaded, and recovers", async () => {
    const page = await freshPage();
    await page.setRequestInterception(true);
    let offline = true;
    page.on("request", (r) =>
      offline && r.url().includes("/catalog/") ? r.abort() : r.continue(),
    );
    await page.goto(site.url());
    await page.$eval("#source", (el) => ((el as HTMLTextAreaElement).value = "{ a.b = 1; }"));
    await page.click("#validate");
    await page.waitForFunction(() =>
      document.querySelector("#results")?.textContent?.includes("No se pudo cargar el catálogo"),
    );
    offline = false;
    await validateIn(page, "{ services.openssh.enable = true; }");
    expect(await page.$eval(".summary", (el) => el.className)).toContain("good");
  });

  test("works when the site is served below a base path", async () => {
    const page = await freshPage();
    const failed: string[] = [];
    page.on("response", (r) => r.status() >= 400 && failed.push(r.url()));
    await page.goto(sub.url("/"));
    await validateIn(page, "{ services.openssh.enabel = true; }");
    expect(await page.$$eval(".diag", (els) => els.length)).toBe(1);
    expect(await page.$eval(".lang-switch", (el) => (el as HTMLAnchorElement).href)).toContain(
      "/nixchecker/en/",
    );
    expect(failed).toEqual([]);
  });

  test("validates a file of thousands of lines without freezing", async () => {
    const page = await freshPage();
    await page.goto(site.url());
    const lines = Array.from({ length: 4000 }, (_, i) => `  environment.variables.V${i} = "x";`);
    const source = `{\n${lines.join("\n")}\n  services.openssh.enabel = true;\n}`;
    const started = Date.now();
    await validateIn(page, source);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(await page.$$eval(".diag", (els) => els.length)).toBe(1);
    expect(await page.$$eval("#gutter .ln", (els) => els.length)).toBe(4003);
  });

  test("fits a phone screen", async () => {
    const page = await freshPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true });
    for (const path of ["/", "/en/"]) {
      await page.goto(site.url(path));
      await validateIn(page, "{ services.openssh.enabel = true; }");
      const [scroll, width] = await page.evaluate(() => [
        document.documentElement.scrollWidth,
        document.documentElement.clientWidth,
      ]);
      expect(scroll).toBeLessThanOrEqual(width ?? 0);
    }
  });

  test("can be used with the keyboard alone", async () => {
    const page = await freshPage();
    await page.goto(site.url());
    await page.focus("#source");
    await page.keyboard.type("{ services.openssh.enabel = true; }");
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      if (await page.evaluate(() => document.activeElement?.id === "validate")) break;
    }
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("validate");
    await page.keyboard.press("Enter");
    await page.waitForSelector("#results .diag");
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
  });

  // Every state the page can be in, in both languages and both color schemes.
  const states: Array<[string, string | undefined]> = [
    ["nothing validated yet", undefined],
    ["a clean result", "{ services.openssh.enable = true; }"],
    ["an unknown option", "{ services.openssh.enabel = true; }"],
    ["a syntax error", "{ a = ; }"],
    ["unchecked assignments", "{ x }: { networking.hostName = x; }"],
  ];
  for (const [name, source] of states) {
    test(`has no accessibility violations with ${name}`, async () => {
      for (const path of ["/", "/en/"]) {
        for (const scheme of ["light", "dark"]) {
          const page = await freshPage();
          await page.setBypassCSP(true);
          await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
          await page.goto(site.url(path));
          if (source) await validateIn(page, source);
          // The entrance animations blend colors while they run: measure the settled page.
          await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
          await page.addScriptTag({ path: join(root, "node_modules/axe-core/axe.min.js") });
          const violations = await page.evaluate(async () => {
            // biome-ignore lint/suspicious/noExplicitAny: axe is injected as a global
            const result = await (window as any).axe.run();
            return result.violations.map(
              (v: { id: string; nodes: unknown[] }) => `${v.id} (${v.nodes.length})`,
            );
          });
          expect({ path, scheme, violations }).toEqual({ path, scheme, violations: [] });
        }
      }
    }, 60_000);
  }

  // CI sets REQUIRE_FIREFOX, so a missing browser fails the run instead of skipping the test.
  const firefox = Bun.which("firefox");
  const required = process.env.REQUIRE_FIREFOX === "1";
  test.skipIf(!firefox && !required)(
    "validates in Firefox too",
    async () => {
      expect(firefox).toBeTruthy();
      const other = await puppeteer.launch({
        browser: "firefox",
        executablePath: firefox as string,
        headless: true,
      });
      try {
        const page = await other.newPage();
        await page.goto(site.url());
        await validateIn(page, "{ services.openssh.enabel = true; }");
        expect(await page.$$eval(".diag", (els) => els.length)).toBe(1);
      } finally {
        await other.close();
      }
    },
    60_000,
  );
});
