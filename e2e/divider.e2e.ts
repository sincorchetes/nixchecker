// The bar between the editor and the findings: it moves with the pointer and the keyboard, stays within its
// limits, goes back with a double click, is kept between visits, and does not exist where there is no side by side.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Browser, Page } from "puppeteer-core";
import { dist, launchChrome, serveSite } from "./support";

let site: ReturnType<typeof serveSite>;
let browser: Browser;
let page: Page;

const findings = () => page.$eval(".panel", (el) => el.getBoundingClientRect().width);
const whole = () => page.$eval("#checker", (el) => el.getBoundingClientRect().width);
const share = async () => ((await findings()) / (await whole())) * 100;
const editorShare = () => page.$eval("#divider", (el) => Number(el.getAttribute("aria-valuenow")));
const center = () =>
  page.$eval("#divider", (el) => {
    const box = el.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  });

async function drag(to: number) {
  const from = await center();
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to, from.y, { steps: 8 });
  await page.mouse.up();
}

beforeAll(async () => {
  site = serveSite(dist);
  browser = await launchChrome();
  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(site.url());
  await page.evaluate(() => localStorage.removeItem("results-width"));
  await page.reload();
});

afterAll(async () => {
  await browser?.close();
  site?.stop();
});

describe("divider", () => {
  test("starts with the findings at a third of the width, and says how much the editor has", async () => {
    expect(await share()).toBeGreaterThan(24);
    expect(await share()).toBeLessThan(34);
    expect(await editorShare()).toBe(70);
    expect(await page.$eval("#divider", (el) => el.getAttribute("role"))).toBe("separator");
  });

  test("dragging it left gives the findings more room, and the editor less", async () => {
    const before = await findings();
    const from = await center();
    await drag(from.x - 200);
    expect(await findings()).toBeGreaterThan(before + 120);
    expect(await editorShare()).toBeLessThan(70);
  });

  test("it stays within its limits however far it is dragged", async () => {
    await drag(0);
    expect(await share()).toBeLessThanOrEqual(61);
    expect(await editorShare()).toBe(40);
    await drag(1439);
    // The findings never get narrower than their minimum (20rem).
    expect(await findings()).toBeGreaterThanOrEqual(319);
    expect(await editorShare()).toBeGreaterThanOrEqual(73);
  });

  test("the arrow keys move it, Home and End go to the ends and Enter puts it back", async () => {
    await page.focus("#divider");
    const start = await findings();
    await page.keyboard.press("ArrowLeft");
    const wider = await findings();
    expect(wider).toBeGreaterThan(start);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    expect(await findings()).toBeLessThan(wider);
    await page.keyboard.press("Home");
    expect(await editorShare()).toBe(40);
    await page.keyboard.press("End");
    // As far as the findings can narrow: 20rem, a little over a quarter of the 76rem the page holds.
    expect(await editorShare()).toBeGreaterThanOrEqual(73);
    expect(await findings()).toBeGreaterThanOrEqual(319);
    expect(await page.$eval("#divider", (el) => Number(el.getAttribute("aria-valuemax")))).toBe(
      await editorShare(),
    );
    await page.keyboard.press("Enter");
    expect(await editorShare()).toBe(70);
  });

  test("a double click puts it back", async () => {
    await page.keyboard.press("Home");
    expect(await editorShare()).toBe(40);
    const at = await center();
    await page.mouse.click(at.x, at.y, { count: 2 });
    expect(await editorShare()).toBe(70);
  });

  test("the width chosen is kept for the next visit", async () => {
    await page.focus("#divider");
    await page.keyboard.press("Home");
    const chosen = await findings();
    await page.reload();
    expect(Math.abs((await findings()) - chosen)).toBeLessThan(2);
    expect(await editorShare()).toBe(40);
    await page.evaluate(() => localStorage.removeItem("results-width"));
  });

  test("the editor still has its text in view and the findings theirs after it moved", async () => {
    await page.reload();
    await page.focus("#divider");
    await page.keyboard.press("Home");
    const editor = await page.$eval(".frame", (el) => el.getBoundingClientRect().width);
    expect(editor).toBeGreaterThan(400);
    await page.keyboard.press("Enter");
  });

  test("is not there on a narrow screen, where the editor and the findings take turns", async () => {
    await page.setViewport({ width: 390, height: 844, isMobile: true });
    expect(await page.$eval("#divider", (el) => getComputedStyle(el).display)).toBe("none");
    await page.setViewport({ width: 1440, height: 900 });
  });
});
