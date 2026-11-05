// Browser tests of the targets and systems the page can check a text against.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Browser, Page } from "puppeteer-core";
import { dist, launchChrome, serveSite, validateIn } from "./support";

let site: ReturnType<typeof serveSite>;
let browser: Browser;
let page: Page;

const validate = (source: string) => validateIn(page, source);

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

describe("targets and systems", () => {
  test("detects a Mac configuration and checks it against nix-darwin", async () => {
    await validate('{ homebrew.enable = true; system.defaults.dock.autohide = "yes"; }');
    expect(await page.$eval("#results", (el) => el.textContent)).toContain(
      "system.defaults.dock.autohide",
    );
    await page.select("#target", "auto");
  });

  test("a nix.conf is told from Nix and its settings are checked", async () => {
    await validate("experimental-features = nix-command flakes\nkeep-goin = true\n");
    const text = await page.$eval("#results", (el) => el.textContent);
    expect(text).toContain("keep-goin");
    expect(text).toContain("keep-going");
  });

  test("the options of sops-nix are known, and a misspelled one gets its suggestion", async () => {
    await validate('{ sops.secrets.token.owner = "root"; sops.secret.x = 1; }');
    await page.select("#target", "nixos");
    const text = await page.$eval("#results", (el) => el.textContent);
    expect(text).toContain("sops.secret.x");
    expect(text).toContain("sops.secrets.x");
    expect(text).toContain("«sops.secret.x»");
    expect(text).not.toContain("«sops.secrets.token.owner»");
    await page.select("#target", "auto");
  });

  test("the systems offered follow the target", async () => {
    const offered = () =>
      page.$$eval("#system option:not([disabled])", (os) =>
        os.map((o) => (o as HTMLOptionElement).value),
      );
    await page.select("#target", "nix-darwin");
    expect(await offered()).toEqual(["aarch64-darwin", "x86_64-darwin"]);
    expect(await page.$eval("#system", (el) => (el as HTMLSelectElement).value)).toBe(
      "aarch64-darwin",
    );
    await page.select("#target", "nixos");
    expect(await offered()).toEqual(["x86_64-linux", "aarch64-linux"]);
    expect(await page.$eval("#system", (el) => (el as HTMLSelectElement).value)).toBe(
      "x86_64-linux",
    );
    await page.select("#target", "auto");
    expect(await offered()).toHaveLength(4);
  });

  test("the details give the command that makes the same check with your own Nix", async () => {
    await validate("{ services.openssh.enabel = true; }");
    await page.select("#target", "nixos");
    await page.select("#system", "aarch64-linux");
    await page.waitForSelector(".command");
    expect(await page.$eval(".command", (el) => el.textContent)).toBe(
      "nix run github:sincorchetes/nixchecker -- my-config.nix --target nixos --release 26.05 --system aarch64-linux",
    );
    await page.select("#system", "x86_64-linux");
    await page.select("#target", "auto");
  });

  test("changing the system validates again", async () => {
    await validate("{ services.openssh.enable = true; }");
    await page.$eval("#results", (el) => el.replaceChildren());
    await page.select("#system", "aarch64-linux");
    await page.waitForSelector("#results .summary");
    expect(await page.$eval("#system", (el) => (el as HTMLSelectElement).value)).toBe(
      "aarch64-linux",
    );
    await page.select("#system", "x86_64-linux");
  });
});
