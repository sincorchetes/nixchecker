// A narrow screen, where the editor and the findings take turns: the state beside the Validate button, the
// buttons that switch between them, and that nothing moves the page by itself while someone types.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Browser, Page } from "puppeteer-core";
import { dist, launchChrome, serveSite, settled, validateIn } from "./support";

let site: ReturnType<typeof serveSite>;
let browser: Browser;
let page: Page;

const text = (selector: string) => page.$eval(selector, (el) => el.textContent ?? "");
const shown = (selector: string) =>
  page.$eval(selector, (el) => getComputedStyle(el).display !== "none");
const TWO = '{ services.openssh.enable = "yes"; services.nginx.enabel = true; }';

beforeAll(async () => {
  site = serveSite(dist);
  browser = await launchChrome();
  page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  await page.goto(site.url());
});

afterAll(async () => {
  await browser?.close();
  site?.stop();
});

describe("a narrow screen", () => {
  test("starts with the editor, and the problems a button away", async () => {
    expect(await shown(".bench")).toBe(true);
    expect(await shown(".panel")).toBe(false);
    expect(await text("#view-problems")).toBe("Problemas");
  });

  test("validating on purpose shows the problems, with their number on the button and in the state", async () => {
    await validateIn(page, TWO);
    expect(await shown(".panel")).toBe(true);
    expect(await shown(".bench")).toBe(false);
    expect(await text("#view-problems")).toBe("Problemas (2)");
    expect(await page.$eval("#view-problems", (el) => el.getAttribute("aria-pressed"))).toBe(
      "true",
    );
  });

  test("a finding takes back to the editor, with its word selected", async () => {
    await page.click(".where");
    expect(await shown(".bench")).toBe(true);
    const picked = await page.$eval("#source", (el) => {
      const area = el as HTMLTextAreaElement;
      return area.value.slice(area.selectionStart, area.selectionEnd);
    });
    expect(picked).toBe("services.openssh.enable");
  });

  test("the state stays beside the editor: what was found, and that it is out of date once it changes", async () => {
    expect(await text("#state")).toBe("2 errores");
    await page.click("#source");
    await page.keyboard.type(" ");
    expect(await text("#state")).toBe("Resultado anterior");
    // Validating by itself after a pause neither moves the page nor swaps the view: it would cut the typing.
    await page.waitForFunction(() => document.getElementById("state")?.textContent === "2 errores");
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await shown(".bench")).toBe(true);
    expect(await shown(".panel")).toBe(false);
  });

  test("a clean text says so", async () => {
    await page.$eval(
      "#source",
      (el) => ((el as HTMLTextAreaElement).value = "{ services.openssh.enable = true; }"),
    );
    await page.click("#validate");
    await settled(page);
    await page.click("#view-editor");
    expect(await text("#state")).toBe("Sin problemas");
    expect(await text("#view-problems")).toBe("Problemas");
  });

  test("says that it is validating when it takes a moment", async () => {
    const slowSite = serveSite(dist, "", () => false, 700);
    const slow = await (await browser.createBrowserContext()).newPage();
    await slow.setViewport({ width: 390, height: 844, isMobile: true });
    await slow.goto(slowSite.url());
    await slow.$eval("#source", (el, v) => ((el as HTMLTextAreaElement).value = v), TWO);
    await slow.click("#validate");
    await slow.waitForFunction(
      () => document.getElementById("state")?.textContent === "Validando…",
    );
    await slow.waitForFunction(() => document.getElementById("state")?.textContent === "2 errores");
    await slow.close();
    slowSite.stop();
  });

  test("the header leaves room for the editor", async () => {
    const top = await page.$eval(".frame", (el) => el.getBoundingClientRect().top);
    expect(top).toBeLessThan(400);
  });
});
