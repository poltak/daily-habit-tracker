// Checks that two servers show the same page: the same elements with the same classes, attributes, text and boxes.
// Usage: NODE_PATH=<playwright> node vanilla/bench/compare-dom.mjs react=http://localhost:3101 plain=http://localhost:3102
// Both servers must hold the same journal data. The script walks through each view at a phone and a desktop width.
import { launchBrowser, targetsFromArguments } from "./lib.mjs";

const targets = targetsFromArguments();
if (targets.length !== 2) throw new Error("Give two servers to compare.");

// Runs in the page. One row for each element, in document order.
function snapshot() {
  // The plain scripts find their controls by these attributes. React writes `value` and `checked` for the inputs that it controls.
  const ignored = new Set(["data-action", "data-id", "data-view", "data-kind", "data-group", "data-shift", "data-index", "data-date", "data-icon", "data-category", "data-a", "data-b", "style", "class", "value", "checked"]);
  const rows = [];
  for (const element of document.querySelectorAll("body *")) {
    if (element.tagName === "SCRIPT") continue;
    const box = element.getBoundingClientRect();
    const attributes = [...element.attributes].filter((attribute) => !ignored.has(attribute.name)).map((attribute) => `${attribute.name}=${attribute.value}`).sort().join(" ");
    const text = [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.nodeValue).join("").replace(/\s+/g, " ").trim();
    const value = "value" in element && element.tagName !== "BUTTON" && element.tagName !== "OPTION" ? ` value=${element.value}` : "";
    const state = `${element.disabled ? " :disabled" : ""}${element.checked ? " :checked" : ""}${element.open ? " :open" : ""}`;
    rows.push({ signature: `${element.tagName.toLowerCase()}.${[...element.classList].join(".")} [${attributes}]${value}${state} {${element.style?.cssText ?? ""}} "${text}"`, box: [box.x, box.y, box.width, box.height] });
  }
  return rows;
}

const nav = (page, name) => page.getByRole("navigation").getByRole("button", { name, exact: true }).click();
const calendarLoaded = (page) => page.waitForFunction(() => !document.querySelector(".calendar-loading"));

/** @type {Array<[name: string, action: (page: import("playwright").Page) => Promise<unknown>]>} */
const STEPS = [
  ["log", (page) => page.locator(".mood-option:not(:disabled)").first().waitFor()],
  ["log, groups open", async (page) => { for (const summary of await page.locator(".activity-groups summary").all()) await summary.click(); }],
  ["log, search with matches", (page) => page.getByPlaceholder("Search your activities").fill("a")],
  ["log, search with no match", (page) => page.getByPlaceholder("Search your activities").fill("zzzz")],
  ["calendar", async (page) => { await page.getByPlaceholder("Search your activities").fill(""); await nav(page, "Calendar"); await page.locator(".calendar-day").first().waitFor(); await calendarLoaded(page); }],
  ["calendar, previous month", async (page) => { await page.getByRole("button", { name: "Previous month" }).click(); await calendarLoaded(page); }],
  ["setup", async (page) => { await nav(page, "Setup"); await page.getByRole("heading", { name: "Make it yours" }).waitFor(); }],
  ["setup, groups open", async (page) => { for (const summary of await page.locator(".management-groups summary").all()) await summary.click({ position: { x: 20, y: 12 } }); }],
  ["setup, filter", (page) => page.getByRole("textbox", { name: "Filter activities to manage" }).fill("g")],
  ["setup, icon picker", async (page) => { await page.locator('.management-row button[aria-label^="Choose icon for"]').first().click(); await page.locator(".icon-picker").waitFor(); }],
  ["setup, icon picker search", (page) => page.getByRole("textbox", { name: "Search icons" }).fill("sport")],
  ["goal", async (page) => { await page.keyboard.press("Escape"); await page.locator('.management-row button[aria-label^="Configure"]').first().click(); await page.locator(".goal-week-row").first().waitFor(); await calendarLoaded(page); }],
  ["goal, weekly", (page) => page.getByLabel("Repeat", { exact: true }).selectOption("weekly")],
  ["add activity", async (page) => { await page.goBack(); await page.getByRole("heading", { name: "Make it yours" }).waitFor(); await page.locator(".management-groups summary").first().click({ position: { x: 20, y: 12 } }); await page.getByRole("button", { name: /^Add new activity to / }).first().click(); await page.getByPlaceholder("Activity name").waitFor(); }],
  ["insights", async (page) => { await page.getByRole("button", { name: "Cancel" }).click(); await nav(page, "Insights"); await page.waitForFunction(() => !document.querySelector(".insights-loading")); }],
];

// The same element with the same content, and a box that is the same to a tenth of a pixel.
const same = (left, right) => left && right && left.signature === right.signature && left.box.every((value, index) => Math.abs(value - right.box[index]) < 0.1);

const browser = await launchBrowser();
let failures = 0;
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    const pages = [];
    for (const target of targets) {
      const context = await browser.newContext({ viewport, serviceWorkers: "block", reducedMotion: "reduce" });
      const page = await context.newPage();
      page.on("pageerror", (error) => console.log(`Page error on ${target.name}: ${error.message}`));
      await page.goto(target.url);
      pages.push(page);
    }
    for (const [name, action] of STEPS) {
      const snapshots = [];
      for (const page of pages) {
        await action(page);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(350);
        await page.evaluate(() => window.scrollTo(0, 0));
        snapshots.push(await page.evaluate(snapshot));
      }
      const [first, second] = snapshots;
      const different = [];
      for (let index = 0; index < Math.max(first.length, second.length); index += 1) if (!same(first[index], second[index])) different.push(index);
      if (different.length) failures += 1;
      console.log(`${different.length ? "DIFFERENT" : "SAME     "}  ${String(viewport.width).padStart(4)}px  ${name.padEnd(26)} ${first.length} and ${second.length} elements${different.length ? `, ${different.length} rows differ` : ""}`);
      for (const index of different.slice(0, 3)) console.log(`      ${targets[0].name}: ${JSON.stringify(first[index])}\n      ${targets[1].name}: ${JSON.stringify(second[index])}`);
    }
    for (const page of pages) await page.context().close();
  }
} finally {
  await browser.close();
}
console.log(failures ? `${failures} view states differ.` : "Each view state is the same on both servers.");
process.exitCode = failures ? 1 : 0;
