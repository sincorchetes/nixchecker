// The editor and the findings as one workbench: what an underlined word says by the pointer, and the
// editor and the findings side by side so that nothing needs a scroll of the page to be seen.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Browser, Page } from "puppeteer-core";
import { dist, launchChrome, serveSite, validateIn } from "./support";

let site: ReturnType<typeof serveSite>;
let browser: Browser;
let page: Page;

beforeAll(async () => {
  site = serveSite(dist);
  browser = await launchChrome();
  page = await browser.newPage();
  await page.goto(site.url());
});

afterAll(async () => {
  await browser?.close();
  site?.stop();
});

describe("workbench", () => {
  test("what an underlined word says shows by the pointer, and goes when it leaves", async () => {
    await validateIn(page, "{ services.openssh.enabel = true; }");
    await page.waitForSelector("#highlight .mk-error");
    const box = await page.$eval("#highlight .mk-error", (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(box.x, box.y);
    await page.waitForSelector(".tip:not([hidden])");
    const said = await page.$eval(".tip", (el) => el.textContent ?? "");
    expect(said).toContain("services.openssh.enabel");
    expect(said).toContain("services.openssh.enable");
    // It is for the eyes: the findings beside the editor are what is read out.
    expect(await page.$eval(".tip", (el) => el.getAttribute("aria-hidden"))).toBe("true");
    await page.mouse.move(2, 2);
    await page.waitForSelector(".tip", { hidden: true });
  });

  test("the editor and what was found are side by side, in view, on a wide window", async () => {
    await page.setViewport({ width: 1440, height: 900 });
    await validateIn(page, '{ services.openssh.enable = "yes"; }');
    const place = await page.evaluate(() => {
      const editor = document.querySelector(".editor")?.getBoundingClientRect();
      const found = document.querySelector("#results .diag")?.getBoundingClientRect();
      return {
        editorRight: editor?.right ?? 0,
        foundLeft: found?.left ?? 0,
        foundTop: found?.top ?? 0,
      };
    });
    expect(place.foundLeft).toBeGreaterThanOrEqual(place.editorRight);
    expect(place.foundTop).toBeLessThan(900);
    await page.setViewport({ width: 800, height: 600 });
  });
});
