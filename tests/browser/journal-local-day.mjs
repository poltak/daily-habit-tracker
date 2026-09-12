// All API data is synthetic. Run with the same setup as journal-draft-safety.mjs.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DaylioMemoryStore } from "../../lib/daylio.ts";

const { chromium } = createRequire(import.meta.url)("playwright");
const baseURL = process.env.JOURNAL_TEST_URL ?? "http://localhost:3102";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname));
const browser = await chromium.launch({ headless: true, channel: process.env.JOURNAL_TEST_BROWSER });
try {
  for (const scenario of [
    { zone: "Asia/Ho_Chi_Minh", utc: "2026-09-11T17:30:00Z", serverToday: "2026-09-11", localToday: "2026-09-12", nextUtc: "2026-09-12T17:30:00Z", nextDay: "2026-09-13" },
    { zone: "America/New_York", utc: "2026-09-12T00:30:00Z", serverToday: "2026-09-12", localToday: "2026-09-11", nextUtc: "2026-09-12T04:30:00Z", nextDay: "2026-09-12" },
  ]) {
    const context = await browser.newContext({ timezoneId: scenario.zone, serviceWorkers: "block" });
    const page = await context.newPage();
    await page.clock.install({ time: new Date(scenario.utc) });
    await context.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/bootstrap") return route.fulfill({ json: { ...new DaylioMemoryStore().bootstrap(), today: scenario.serverToday } });
      if (path.startsWith("/api/entries/")) return route.fulfill({ status: 404, json: { entry: null, completedGoalIds: [] } });
      throw new Error(`Unexpected request: ${path}`);
    });
    await page.goto(baseURL);
    await page.locator(".mood-option:not(:disabled)").first().waitFor();
    const date = page.locator('input[type="date"]');
    assert.equal(await date.inputValue(), scenario.localToday);
    await page.clock.setSystemTime(new Date(scenario.nextUtc));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    // Midnight updates shortcuts without moving the entry currently being edited.
    assert.equal(await date.inputValue(), scenario.localToday);
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await page.locator(".mood-option:not(:disabled)").first().waitFor();
    assert.equal(await date.inputValue(), scenario.nextDay);
    await context.close();
  }
  console.log("PASS: local Today in UTC+7 and UTC-4, plus midnight refresh without changing the active entry.");
} finally {
  await browser.close();
}
