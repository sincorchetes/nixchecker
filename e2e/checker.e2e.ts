// Browser tests: they drive the built site (`dist/`) in a real Chrome, so they need
// `bun run build` first and a Chrome binary (CHROME_BIN, or google-chrome on the PATH).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Browser, Page } from "puppeteer-core";
import { dist, launchChrome, serveSite, validateIn } from "./support";

let site: ReturnType<typeof serveSite>;
let browser: Browser;
let page: Page;
const url = (path = "/") => site.url(path);

const summary = () => page.$eval(".summary", (el) => el.className);
const messages = () => page.$$eval(".diag .msg", (els) => els.map((el) => el.textContent ?? ""));

const validate = (source: string) => validateIn(page, source);

beforeAll(async () => {
  site = serveSite(dist);
  browser = await launchChrome();
  page = await browser.newPage();
  await page.goto(url());
});

afterAll(async () => {
  await browser?.close();
  site?.stop();
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

  test("shows how many assignments could be checked", async () => {
    await validate("{ x, ... }: { networking.hostName = x; networking.useDHCP = true; }");
    const detected = await page.$eval(".detected", (el) => el.textContent ?? "");
    expect(detected).toMatch(/1 de 2 asignaciones comprobadas/);
    expect(await page.$eval(".skip.dynamic", (el) => el.textContent)).toBe("1 con valor dinámico");
    await page.click(".skip.dynamic");
    const picked = await page.$eval("#source", (el) => {
      const area = el as HTMLTextAreaElement;
      return area.value.slice(area.selectionStart, area.selectionEnd);
    });
    expect(picked).toBe("networking.hostName");
  });

  test("dims the results the moment the text changes, until it is validated", async () => {
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
    // disko is not used by any earlier test, so nothing of it is cached yet.
    await validate("{ disko.devices = { }; }");
    expect(files).toEqual(["disko/index.json", "disko/disko~0.json"]);
  });

  test("validates against the chosen release", async () => {
    // Fixed to NixOS: left on auto, `programs.atuin` would be found in Home Manager instead.
    await page.select("#target", "nixos");
    await validate("{ programs.atuin.enable = true; }");
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
    await page.select("#target", "auto");
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

  test("picks Home Manager for a file that only makes sense there", async () => {
    await validate('{ programs.zsh.initContent = ""; programs = lib.mkMerge [ ]; }');
    expect(await summary()).toContain("good");
    expect(await page.$eval(".detected", (el) => el.textContent)).toContain("Home Manager");
  });

  test("the parallax layers follow the scroll, and the header jumps to the validator", async () => {
    await page.goto(url());
    const first = () => page.$eval(".plx", (el) => (el as HTMLElement).style.transform);
    const before = await first();
    await page.evaluate(() => window.scrollTo(0, 700));
    await page.waitForFunction(
      (was) => (document.querySelector(".plx") as HTMLElement).style.transform !== was,
      {},
      before,
    );
    expect(await first()).not.toBe(before);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.click(".header-cta");
    await page.waitForFunction(() => location.hash === "#validador");
    expect(await page.$eval(".lang-switch", (el) => el.textContent)).toContain("EN");
  });

  test("works in English", async () => {
    await page.goto(url("/en/"));
    await validate("{ services.openssh.enabel = true; }");
    expect((await messages())[0]).toContain("does not exist");
  });
});
