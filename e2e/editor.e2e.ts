// The editor around the text: validating by itself, opening files, the report as a download and the
// text kept between visits.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { Browser, Page } from "puppeteer-core";
import { dist, launchChrome, serveSite, validateIn } from "./support";

let site: ReturnType<typeof serveSite>;
let browser: Browser;
let page: Page;
const dir = await Bun.$`mktemp -d`.text().then((t) => t.trim());

const text = () => page.$eval("#source", (el) => (el as HTMLTextAreaElement).value);
const empty = () => page.$eval("#results .empty", (el) => el.textContent ?? "");

// Drops a file with this content on the editor, as dragging it from the desktop does.
const drop = (name: string, content: string) =>
  page.$eval(
    ".editor",
    (area, file, body) => {
      const data = new DataTransfer();
      data.items.add(new File([body], file));
      area.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true }));
    },
    name,
    content,
  );

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

describe("validating by itself", () => {
  test("a pause in typing validates, with no click", async () => {
    await page.$eval("#source", (el) => ((el as HTMLTextAreaElement).value = ""));
    await page.type("#source", "{ networking.hostName = 5; }");
    expect(await page.$eval("#results", (el) => el.hasAttribute("data-stale"))).toBe(true);
    await page.waitForSelector("#results:not([data-stale]) .summary.bad");
  });
});

describe("opening files", () => {
  test("the picker puts the file in the editor and validates it", async () => {
    const path = join(dir, "picked.nix");
    await Bun.write(path, "{ services.openssh.enable = true; }\n");
    await page.$eval("#results", (el) => el.replaceChildren());
    const input = await page.$("input#file");
    await input?.uploadFile(path);
    await page.waitForSelector("#results .summary.good");
    expect(await text()).toBe("{ services.openssh.enable = true; }\n");
  });

  test("a dropped file is read the same way", async () => {
    await page.$eval("#results", (el) => el.replaceChildren());
    await drop("dropped.nix", "{ networking.hostName = 5; }");
    await page.waitForSelector("#results .summary.bad");
    expect(await text()).toBe("{ networking.hostName = 5; }");
  });

  test("a file that is too large is refused and the text stays", async () => {
    await drop("big.nix", "x".repeat(600 * 1024));
    await page.waitForSelector("#results .empty");
    expect(await empty()).toContain("512 KB");
    expect(await text()).toBe("{ networking.hostName = 5; }");
  });
});

describe("the report", () => {
  test("is downloadable once there is one, and holds what the page shows", async () => {
    await page.$eval("#source", (el) => ((el as HTMLTextAreaElement).value = ""));
    expect(await page.$eval("#export", (el) => (el as HTMLButtonElement).disabled)).toBe(true);
    await page.evaluate(() => {
      const make = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        (window as unknown as { saved: Blob }).saved = blob as Blob;
        return make(blob);
      };
    });
    await validateIn(page, "{ networking.hostName = 5; }");
    expect(await page.$eval("#export", (el) => (el as HTMLButtonElement).disabled)).toBe(false);
    await page.click("#export");
    const saved = await page.evaluate(() => (window as unknown as { saved: Blob }).saved.text());
    const data = JSON.parse(saved);
    expect(data.target).toBe("nixos");
    expect(data.coverage).toEqual({ checked: 1, total: 1 });
    expect(data.diagnostics[0]).toMatchObject({ code: "type-mismatch", line: 1 });
  });
});

describe("remembering the text", () => {
  test("is off unless asked, and then it survives a reload", async () => {
    await page.reload();
    expect(await page.$eval("#remember", (el) => (el as HTMLInputElement).checked)).toBe(false);
    await page.type("#source", "{ x = 1; }");
    await page.reload();
    expect(await text()).toBe("");

    await page.click("#remember");
    await page.type("#source", "{ y = 2; }");
    await page.reload();
    expect(await text()).toBe("{ y = 2; }");
    expect(await page.$eval("#remember", (el) => (el as HTMLInputElement).checked)).toBe(true);
  });

  test("turning it off forgets the text", async () => {
    await page.click("#remember");
    await page.reload();
    expect(await text()).toBe("");
  });
});

describe("colors and underlines", () => {
  const classes = () =>
    page.$$eval("#highlight span", (els) => els.map((el) => [el.className, el.textContent ?? ""]));

  test("the text is colored by what it is", async () => {
    await page.$eval("#source", (el) => {
      (el as HTMLTextAreaElement).value = '# note\n{ a = "x"; b = 12; c = ./p; d = true; }\n';
      el.dispatchEvent(new Event("input"));
    });
    await page.waitForFunction(() => document.querySelector("#highlight .tok-path"));
    const found = await classes();
    expect(found).toContainEqual(["tok-comment", "# note"]);
    expect(found).toContainEqual(["tok-string", '"x"']);
    expect(found).toContainEqual(["tok-number", "12"]);
    expect(found).toContainEqual(["tok-path", "./p"]);
    expect(found).toContainEqual(["tok-keyword", "true"]);
  });

  test("the layer is the text area's twin, so the colors sit on the characters", async () => {
    const metrics = (selector: string) =>
      page.$eval(selector, (el) => {
        const style = getComputedStyle(el);
        return ["fontFamily", "fontSize", "lineHeight", "paddingTop", "paddingLeft", "tabSize"].map(
          (key) => style[key as keyof CSSStyleDeclaration],
        );
      });
    expect(await metrics("#highlight")).toEqual(await metrics("#source"));
    // The text itself is the layer's: the text area's is drawn transparent, with a visible caret.
    const fill = await page.$eval("#source", (el) => getComputedStyle(el).webkitTextFillColor);
    expect(fill).toBe("rgba(0, 0, 0, 0)");
  });

  test("a finding is underlined where it is, until the text changes", async () => {
    await validateIn(page, "{ networking.hostName = 5; }");
    await page.waitForSelector("#highlight .mk-error");
    expect(await page.$eval("#highlight .mk-error", (el) => el.textContent)).toBe(
      "networking.hostName",
    );
    await page.type("#source", " ");
    await page.waitForFunction(() => !document.querySelector("#highlight .mk-error"));
  });

  test("long lines scroll sideways with the colors, and the layer is as tall as the text", async () => {
    const lines = Array.from({ length: 80 }, (_, n) => `  a${n} = "${"x".repeat(200)}";`).join(
      "\n",
    );
    await page.$eval(
      "#source",
      (el, text) => {
        const area = el as HTMLTextAreaElement;
        area.value = `{\n${text}\n}`;
        area.dispatchEvent(new Event("input"));
        area.scrollLeft = 120;
        area.dispatchEvent(new Event("scroll"));
      },
      lines,
    );
    // The colors are redrawn on the next frame, and only then are they wide enough to scroll.
    await page.waitForFunction(() => document.getElementById("highlight")?.scrollLeft === 120);
    const heights = await page.evaluate(() => [
      document.getElementById("highlight")?.clientHeight,
      document.getElementById("source")?.clientHeight,
    ]);
    expect(heights[0]).toBe(heights[1]);
  });
});

describe("validating without a worker", () => {
  test("gives the same answer in the page when workers are not available", async () => {
    const plain = await browser.newPage();
    await plain.evaluateOnNewDocument(() => {
      (window as unknown as { Worker?: unknown }).Worker = undefined;
    });
    await plain.goto(site.url());
    await validateIn(plain, "{ networking.hostName = 5; services.openssh.enabel = true; }");
    const found = await plain.$$eval(".diag .msg", (els) => els.length);
    expect(found).toBe(2);
    await plain.close();
  });
});

describe("without a connection", () => {
  test("a page that was used opens and validates from what it kept", async () => {
    // Its own server, so the page has an origin (and a service worker) of its own to lose.
    const own = serveSite(dist);
    const offline = await browser.newPage();
    const controlled = () => offline.waitForFunction(() => navigator.serviceWorker.controller);
    await offline.goto(own.url());
    await controlled();
    // The reload is the first visit made under the service worker: that is when everything is kept.
    await offline.reload();
    await controlled();
    await validateIn(offline, "{ networking.hostName = 5; }");

    own.stop();
    await offline.reload();
    await validateIn(offline, "{ networking.hostName = 5; }");
    expect(await offline.$$eval(".diag .msg", (els) => els.length)).toBe(1);
    await offline.close();
  });
});
