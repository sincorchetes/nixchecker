// A touch screen: the same buttons, tapped with a finger instead of clicked, since a tap is not a click for
// everything (hover is not there, and the buttons must not need it).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Browser, Page } from "puppeteer-core";
import { dist, launchChrome, serveSite } from "./support";

let site: ReturnType<typeof serveSite>;
let browser: Browser;
let page: Page;

const tap = async (selector: string) => {
  const handle = await page.waitForSelector(selector);
  await handle?.tap();
};
const text = (selector: string) => page.$eval(selector, (el) => el.textContent ?? "");
const shown = (selector: string) =>
  page.$eval(selector, (el) => getComputedStyle(el).display !== "none");
const source = () => page.$eval("#source", (el) => (el as HTMLTextAreaElement).value);
const theme = () => page.evaluate(() => document.documentElement.dataset.theme ?? "system");

beforeAll(async () => {
  site = serveSite(dist);
  browser = await launchChrome();
  page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(site.url());
});

afterAll(async () => {
  await browser?.close();
  site?.stop();
});

describe("a touch screen", () => {
  test("a tap on the example loads it, and a tap on Validate shows the problems", async () => {
    await tap("#example");
    await tap("#validate");
    await page.waitForSelector(".diag");
    expect(await shown(".panel")).toBe(true);
    expect((await page.$$(".diag")).length).toBe(3);
  });

  test("a tap on a fix applies it, and the text changes", async () => {
    const before = await source();
    await tap(".diag .fix");
    await page.waitForFunction(
      (old) => (document.querySelector("#source") as HTMLTextAreaElement).value !== old,
      {},
      before,
    );
    expect(await source()).not.toBe(before);
  });

  test("taps switch between the problems and the editor", async () => {
    await tap("#view-editor");
    expect(await shown(".bench")).toBe(true);
    await tap("#view-problems");
    expect(await shown(".panel")).toBe(true);
    expect(await text("#view-problems")).toMatch(/^Problemas/);
  });

  test("a tap on the theme button switches the theme", async () => {
    const before = await theme();
    await tap("#theme");
    expect(await theme()).not.toBe(before);
  });
});
