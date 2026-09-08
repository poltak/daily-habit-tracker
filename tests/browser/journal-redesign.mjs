// Run with Playwright available, a local build, and --experimental-strip-types.
// JOURNAL_TEST_BROWSER=chrome uses installed Chrome. All API data is synthetic.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DaylioMemoryStore, addDays } from "../../lib/daylio.ts";

const { chromium } = createRequire(import.meta.url)("playwright");
const baseURL = process.env.JOURNAL_TEST_URL ?? "http://localhost:3101";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname));
const browser = await chromium.launch({ headless: true, channel: process.env.JOURNAL_TEST_BROWSER });

function monthRange(month) {
  const [year, number] = month.split("-").map(Number);
  return { startDate: `${month}-01`, endDate: `${month}-${new Date(year, number, 0).getDate()}` };
}

async function mockApi({ context, store }) {
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const parts = url.pathname.split("/").filter(Boolean);
    const body = request.postDataJSON();
    const [, resource, date, id] = parts;
    let json;
    let status = 200;
    if (resource === "bootstrap") json = store.bootstrap();
    else if (resource === "entries") {
      const entry = request.method() === "PUT" ? store.saveEntry(date, body) : store.getEntry(date);
      json = { entry, completedGoalIds: store.getGoalCompletionIds(date), daySelections: store.getDaySelections(date) };
      if (!entry) status = 404;
    } else if (resource === "day-selections") {
      json = id === "mood" ? { selection: store.setMoodSelection(date, body.moodId) } : store.setActivitySelection(date, parts[4], body.selected);
    } else if (resource === "goal-completions") json = store.setGoalCompletion(date, id, body.completed);
    else if (resource === "calendar") {
      const { startDate, endDate } = monthRange(url.searchParams.get("month"));
      json = { days: store.listEntryDays(startDate, endDate) };
    } else if (resource === "goals") json = store.getGoalHistory({ goalId: date, ...monthRange(url.searchParams.get("month")), asOf: url.searchParams.get("asOf") });
    else if (resource === "catalog" && request.method() === "POST") {
      json = { activity: store.createActivity(body.name, body.groupId, body.icon) };
      status = 201;
    } else throw new Error(`Unexpected test API: ${request.method()} ${url.pathname}`);
    await route.fulfill({ status, json });
  });
}

async function assertFits(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Horizontal overflow at ${page.url()}`);
}

async function capture({ page, path }) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
}

async function assertContrast(page) {
  const pairs = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const muted = getComputedStyle(document.querySelector(".hero-card .muted"));
    const button = getComputedStyle(document.querySelector(".save-actions .primary-button"));
    return [[body.color, body.backgroundColor], [muted.color, body.backgroundColor], [button.color, button.backgroundColor]];
  });
  function luminance(color) {
    const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((value) => value / 255).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  }
  for (const [foreground, background] of pairs) {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    const contrast = (values[0] + .05) / (values[1] + .05);
    assert.ok(contrast >= 4.5, `Text contrast ${contrast.toFixed(2)}: ${foreground} on ${background}`);
  }
}

try {
  for (const [device, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }], ["small-phone", { width: 320, height: 720 }]]) {
    const store = new DaylioMemoryStore();
    const initial = store.bootstrap();
    for (let offset = 1; offset <= 7; offset++) {
      store.saveEntry(addDays(initial.today, -offset), { moodId: initial.moods[offset % 5].id, activityIds: [], completedGoalIds: [], localTime: "20:00", timezone: "UTC" });
    }
    const context = await browser.newContext({ viewport, serviceWorkers: "block", colorScheme: "light" });
    await mockApi({ context, store });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(baseURL);
    await page.locator(".mood-option:not(:disabled)").first().waitFor();
    await page.keyboard.press("Tab");
    assert.equal(await page.locator(".skip-link").evaluate((element) => element === document.activeElement), true);
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("main").evaluate((element) => element === document.activeElement), true);
    const theme = page.getByRole("combobox", { name: "Color theme" });
    const nav = page.getByRole("navigation", { name: "Primary navigation" });

    for (const mode of ["light", "dark"]) {
      await theme.selectOption(mode);
      await page.waitForFunction((mode) => document.documentElement.dataset.theme === mode, mode);
      await assertFits(page);
      await capture({ page, path: `/tmp/daymark-redesign-${device}-${mode}.png` });
      await assertContrast(page);
      await nav.getByRole("button", { name: "Calendar", exact: true }).click();
      await page.locator(".calendar-day.filled").first().waitFor();
      await assertFits(page);
      await capture({ page, path: `/tmp/daymark-redesign-${device}-${mode}-calendar.png` });
      await nav.getByRole("button", { name: "Setup", exact: true }).click();
      const radio = page.locator(`input[name="theme-preference"][value="${mode}"]`);
      assert.equal(await radio.isChecked(), true);
      await assertFits(page);
      await capture({ page, path: `/tmp/daymark-redesign-${device}-${mode}-setup.png` });
      await nav.getByRole("button", { name: "Log", exact: true }).click();
    }

    // Both controls share state; explicit choices survive a full reload.
    await nav.getByRole("button", { name: "Setup", exact: true }).click();
    await page.locator(".theme-option").filter({ has: page.locator('input[value="light"]') }).click();
    assert.equal(await theme.inputValue(), "light");
    await page.reload();
    await page.getByRole("heading", { name: "Make it yours" }).waitFor();
    assert.equal(await theme.inputValue(), "light");
    await theme.selectOption("system");
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForFunction(() => document.documentElement.dataset.theme === "light");

    // Exercise real controls against the in-memory API fixture.
    await nav.getByRole("button", { name: "Log", exact: true }).click();
    await page.locator(".mood-option").first().click();
    await page.locator('.mood-option[aria-pressed="true"]:not(:disabled)').waitFor();
    await page.getByRole("button", { name: `Mark ${initial.goals[0].name} completed`, exact: true }).click();
    await page.locator('.goal-checkbox[aria-pressed="true"]:not(:disabled)').waitFor();
    await page.getByRole("button", { name: "Save entry", exact: true }).click();
    await page.getByRole("button", { name: "Update entry", exact: true }).waitFor();
    assert.equal(store.getEntry(initial.today).moodId, initial.moods[0].id);
    assert.ok(store.getEntry(initial.today).completedGoalIds.includes(initial.goals[0].id));
    await page.getByRole("button", { name: `Open ${initial.goals[0].name} goal`, exact: true }).click();
    await page.locator(".goal-week-row").first().waitFor();
    await assertFits(page);
    await capture({ page, path: `/tmp/daymark-redesign-${device}-goal.png` });
    await page.getByRole("button", { name: "Choose goal icon", exact: true }).click();
    await page.locator(".icon-picker").waitFor();
    assert.equal(await page.getByRole("textbox", { name: "Search icons", exact: true }).evaluate((element) => element === document.activeElement), true);
    await page.locator(".icon-choice").last().focus();
    await page.keyboard.press("Tab");
    assert.equal(await page.getByRole("button", { name: "Close icon picker" }).evaluate((element) => element === document.activeElement), true);
    await page.keyboard.press("Shift+Tab");
    assert.equal(await page.locator(".icon-choice").last().evaluate((element) => element === document.activeElement), true);
    await assertFits(page);
    await capture({ page, path: `/tmp/daymark-redesign-${device}-icons.png` });
    await page.keyboard.press("Escape");
    await page.locator(".icon-picker").waitFor({ state: "hidden" });
    assert.equal(await page.getByRole("button", { name: "Choose goal icon", exact: true }).evaluate((element) => element === document.activeElement), true);
    await page.goBack();
    await page.getByRole("button", { name: "Update entry", exact: true }).waitFor();
    await page.locator(".add-activity-button").first().click();
    await page.getByPlaceholder("Activity name").fill("Test afternoon walk");
    await assertFits(page);
    await capture({ page, path: `/tmp/daymark-redesign-${device}-add-activity.png` });
    await page.getByRole("button", { name: "Add activity", exact: true }).click();
    await page.getByRole("heading", { name: "How did your day feel?" }).waitFor();
    assert.ok(store.bootstrap().activities.some((activity) => activity.name === "Test afternoon walk"));
    assert.deepEqual(errors, []);
    console.log(`PASS ${device}: themes, persistence, system changes, screen sizes, calendar, save, goals, icon picker, activity creation.`);
    await context.close();
  }
} finally { await browser.close(); }
