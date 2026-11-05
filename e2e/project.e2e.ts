// A configuration split in several files, opened together: one in the editor, and what the others declare is known.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { Browser, Page } from "puppeteer-core";
import { dist, launchChrome, serveSite, settled } from "./support";

let site: ReturnType<typeof serveSite>;
let browser: Browser;
let page: Page;
const dir = await Bun.$`mktemp -d`.text().then((t) => t.trim());

const text = () => page.$eval("#source", (el) => (el as HTMLTextAreaElement).value);
const shown = (selector: string) =>
  page.$eval(selector, (el) => getComputedStyle(el).display !== "none");
const options = () => page.$$eval("#project option", (os) => os.map((o) => o.textContent));
const messages = () => page.$$eval(".diag .msg", (els) => els.map((el) => el.textContent ?? ""));

beforeAll(async () => {
  site = serveSite(dist);
  browser = await launchChrome();
  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(site.url());
});

afterAll(async () => {
  await browser?.close();
  site?.stop();
});

describe("a project of several files", () => {
  const declaring = join(dir, "options.nix");
  const using = join(dir, "config.nix");

  test("opening two files lists them, shows the first, and keeps the text that was typed", async () => {
    await Bun.write(
      declaring,
      '{ lib, ... }: { options.my.feature.enable = lib.mkEnableOption "x"; }\n',
    );
    await Bun.write(using, "{ my.feature.enable = true; services.openssh.enabel = true; }\n");
    await page.$eval(
      "#source",
      (el) => ((el as HTMLTextAreaElement).value = '{ networking.hostName = "typed"; }'),
    );
    expect(await shown("#project")).toBe(false);
    const input = await page.$("input#file");
    await input?.uploadFile(using, declaring);
    await page.waitForFunction(() => document.querySelectorAll("#project option").length === 3);
    expect(await options()).toEqual(["untitled.nix", "config.nix", "options.nix"]);
    expect(await shown("#project")).toBe(true);
    expect(
      await page.$eval(
        "#project",
        (el) => (el as HTMLSelectElement).selectedOptions[0]?.textContent,
      ),
    ).toBe("config.nix");
    expect(await text()).toContain("services.openssh.enabel");
  });

  test("what another file declares is known: only the misspelled option is reported", async () => {
    await page.click("#validate");
    await settled(page);
    const found = await messages();
    expect(found.length).toBe(1);
    expect(found[0]).toContain("services.openssh.enabel");
  });

  test("the details give the command over all the files", async () => {
    expect(await page.$eval(".command", (el) => el.textContent)).toContain(
      "-- untitled.nix config.nix options.nix --target",
    );
  });

  test("switching files keeps the edits of the one left, and checks the other", async () => {
    await page.select("#project", "2");
    await page.waitForFunction(() =>
      (document.querySelector("#source") as HTMLTextAreaElement).value.includes("mkEnableOption"),
    );
    await settled(page);
    await page.select("#project", "0");
    await page.waitForFunction(() =>
      (document.querySelector("#source") as HTMLTextAreaElement).value.includes("typed"),
    );
    expect(await text()).toBe('{ networking.hostName = "typed"; }');
  });
});
