// Run: JOURNAL_TEST_URL=http://localhost:3000 node --experimental-strip-types tests/browser/journal-insights.mjs
// Use a local build with Playwright available (or set NODE_PATH).
// Set JOURNAL_TEST_BROWSER=chrome to use an installed Chrome browser.
// All API responses use test fixtures; no journal data is read or written.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { addDays, DaylioMemoryStore } from "../../lib/daylio.ts";

const { chromium } = createRequire(import.meta.url)("playwright");
const baseURL = process.env.JOURNAL_TEST_URL ?? "http://localhost:3103";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname));

const store = new DaylioMemoryStore();
const bootstrap = store.bootstrap();
const [activityA, activityB] = bootstrap.activities;
for (let offset = 0; offset < 120; offset += 1) {
  const pattern = offset % 4;
  store.saveEntry(addDays(bootstrap.today, -offset), {
    moodId: bootstrap.moods[(offset * 3 + Math.floor(offset / 8)) % bootstrap.moods.length].id,
    activityIds: pattern === 0 ? [] : pattern === 1 ? [activityA.id] : pattern === 2 ? [activityB.id] : [activityA.id, activityB.id],
    completedGoalIds: [],
    localTime: "20:00",
  });
}

const browser = await chromium.launch({ headless: true, channel: process.env.JOURNAL_TEST_BROWSER });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/bootstrap") return route.fulfill({ json: bootstrap });
    if (path === "/api/insights") return route.fulfill({ json: store.getInsightsData(), headers: { "cache-control": "private, no-store" } });
    if (path.startsWith("/api/entries/")) return route.fulfill({ status: 404, json: { completedGoalIds: [] } });
    if (path === "/api/calendar") return route.fulfill({ json: { days: [] } });
    throw new Error(`Unexpected API request: ${route.request().method()} ${path}`);
  });

  await page.goto(`${baseURL}/insights`);
  await page.getByRole("heading", { name: "Which activities show up with better moods?" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/insights");
  for (const id of ["insights-activities", "insights-next-day", "insights-combinations", "insights-rhythms", "insights-best-weeks"]) {
    assert.equal(await page.locator(`#${id}`).count(), 1, `${id} renders`);
  }

  const period = page.getByLabel("Explore a period");
  assert.match(await page.locator(".insights-summary").innerText(), /120\s+recorded days/);
  await period.selectOption("90d");
  assert.match(await page.locator(".insights-summary").innerText(), /90\s+recorded days/);
  await period.selectOption("custom");
  await page.getByLabel("From").fill("2020-01-01");
  await page.getByLabel("To").fill("2020-01-01");
  await page.getByRole("heading", { name: "No entries in this period" }).waitFor();
  await period.selectOption("all");

  const activityGroup = page.getByRole("group", { name: "Activity mood associations" });
  const activityButtons = activityGroup.getByRole("button");
  assert.ok(await activityButtons.count() >= 2);
  await activityButtons.nth(1).click();
  assert.equal(await activityButtons.nth(1).getAttribute("aria-pressed"), "true");

  const pairGroup = page.getByRole("group", { name: "Suggested activity pairs" });
  const pairButtons = pairGroup.getByRole("button");
  assert.ok(await pairButtons.count() >= 1);
  await pairButtons.first().click();
  assert.equal(await pairButtons.first().getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator(".insight-rel-pair-picker-wrap select").count(), 2);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log("PASS: insights views, ranges, native button groups, pair controls, and mobile overflow.");
} finally {
  await browser.close();
}
