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
  await page.setViewport({ width: 1440, height: 900 });
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
    await page.setViewport({ width: 1440, height: 900 });
  });
});

describe("the ruler", () => {
  // Where the line is drawn, and where the text of 100 characters ends (both in the page's pixels).
  const measure = () =>
    page.evaluate(() => {
      const ruler = document.querySelector(".ruler") as HTMLElement;
      const line = getComputedStyle(ruler, "::before");
      const box = ruler.getBoundingClientRect();
      const text = document.getElementById("highlight")?.firstChild;
      const range = document.createRange();
      range.setStart(text as Node, 0);
      range.setEnd(text as Node, 100);
      return {
        line: box.left + Number.parseFloat(line.left) + new DOMMatrix(line.transform).m41,
        end: range.getBoundingClientRect().right,
      };
    });

  test("is drawn right after the hundredth character, and moves with the text when it scrolls sideways", async () => {
    await page.goto(site.url());
    await page.$eval("#source", (el) => {
      (el as HTMLTextAreaElement).value = `${"x".repeat(100)}\n${"y".repeat(300)}`;
      el.dispatchEvent(new Event("input"));
    });
    // The page script colors on the next frame.
    await page.waitForFunction(() =>
      document.getElementById("highlight")?.textContent?.startsWith("x".repeat(100)),
    );
    const still = await measure();
    expect(Math.abs(still.line - still.end)).toBeLessThan(2);
    expect(await page.$eval(".ruler", (el) => getComputedStyle(el).pointerEvents)).toBe("none");

    await page.$eval("#source", (el) => {
      (el as HTMLTextAreaElement).scrollLeft = 120;
    });
    await page.waitForFunction(() =>
      document.querySelector(".pane")?.getAttribute("style")?.includes("120px"),
    );
    const moved = await measure();
    expect(Math.abs(moved.line - moved.end)).toBeLessThan(2);
    expect(moved.line).toBeLessThan(still.line - 100);
  });

  test("the position of the cursor says when it is past the line", async () => {
    await page.$eval("#source", (el) => {
      const area = el as HTMLTextAreaElement;
      area.focus();
      area.setSelectionRange(10, 10);
    });
    await page.waitForFunction(
      () => !document.getElementById("cursor")?.classList.contains("over"),
    );
    await page.$eval("#source", (el) => {
      const area = el as HTMLTextAreaElement;
      area.setSelectionRange(250, 250);
    });
    await page.waitForFunction(() => document.getElementById("cursor")?.classList.contains("over"));
    expect(await page.$eval("#cursor", (el) => el.textContent)).toContain("columna 150");
  });
});

describe("replacing the text", () => {
  const value = () => page.$eval("#source", (el) => (el as HTMLTextAreaElement).value);
  const offered = () => page.$eval("#undo", (el) => !(el as HTMLElement).hidden);

  test("clearing or loading the example can be undone, until the next edit", async () => {
    await page.goto(site.url());
    await validateIn(page, "{ services.openssh.enabel = true; }");
    expect(await offered()).toBe(false);

    await page.click("#clear");
    expect(await value()).toBe("");
    expect(await offered()).toBe(true);
    await page.click("#undo-button");
    expect(await value()).toBe("{ services.openssh.enabel = true; }");
    expect(await offered()).toBe(false);

    await page.click("#example");
    expect(await value()).not.toBe("{ services.openssh.enabel = true; }");
    expect(await offered()).toBe(true);
    // Typing is a choice already made: there is no going back to offer.
    await page.type("#source", " ");
    expect(await offered()).toBe(false);
  });

  test("replacing nothing offers nothing back", async () => {
    await page.goto(site.url());
    await page.click("#example");
    expect(await offered()).toBe(false);
  });
});

describe("theme", () => {
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme ?? "system");

  test("follows the system until the button is used, and then keeps what was chosen", async () => {
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
    await page.goto(site.url());
    // Nothing chosen yet, whatever an earlier test left.
    await page.evaluate(() => localStorage.removeItem("theme"));
    await page.reload();
    expect(await theme()).toBe("system");
    const light = await background();
    // The button says what it will switch to.
    expect(await page.$eval("#theme", (el) => el.textContent)).toBe("Modo oscuro");

    await page.click("#theme");
    expect(await theme()).toBe("dark");
    expect(await background()).not.toBe(light);
    expect(await page.$eval("#theme", (el) => el.textContent)).toBe("Modo claro");

    // The choice is applied before the first paint of the next visit, whatever the system says.
    await page.reload();
    expect(await theme()).toBe("dark");
    await page.click("#theme");
    expect(await theme()).toBe("light");
    expect(await background()).toBe(light);
  });

  test("the policy allows the theme script by its hash, with no violation and no 'unsafe-inline' for scripts", async () => {
    await page.evaluateOnNewDocument(() => {
      const seen: string[] = [];
      (window as unknown as { violations: string[] }).violations = seen;
      document.addEventListener("securitypolicyviolation", (e) => seen.push(e.violatedDirective));
    });
    await page.goto(site.url());
    await page.evaluate(() => localStorage.setItem("theme", "dark"));
    await page.reload();
    expect(await theme()).toBe("dark");
    const policy = await page.$eval("meta[http-equiv='Content-Security-Policy']", (el) =>
      el.getAttribute("content"),
    );
    expect(policy).toMatch(/script-src 'self' 'sha256-[A-Za-z0-9+/=]+';/);
    expect(
      await page.evaluate(() => (window as unknown as { violations: string[] }).violations),
    ).toEqual([]);
    await page.evaluate(() => localStorage.removeItem("theme"));
  });

  test("the other language says it in its own words", async () => {
    await page.goto(site.url("/en/"));
    expect(await page.$eval("#theme", (el) => el.textContent)).toMatch(/mode$/);
  });
});

describe("cards settling as they are scrolled into view", () => {
  const motion = async (reduced: boolean) => {
    const other = await (await browser.createBrowserContext()).newPage();
    await other.setViewport({ width: 1440, height: 900 });
    await other.emulateMediaFeatures([
      { name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" },
    ]);
    await other.goto(site.url());
    await validateIn(other, "{ services.openssh.enabel = true; }");
    const name = await other.$eval(".diag", (el) => getComputedStyle(el).animationName);
    await other.close();
    return name;
  };

  test("move a little, and not at all for someone who asked for less motion", async () => {
    expect(await motion(false)).toBe("settle");
    expect(await motion(true)).toBe("none");
  });
});
