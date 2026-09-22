// Run against a local dev server with Playwright available through NODE_PATH.
// Every API response is synthetic. No saved journal data is read or changed.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { addDays, DaylioMemoryStore } from "../../lib/daylio.ts";

const { chromium } = createRequire(import.meta.url)("playwright");
const baseURL = process.env.JOURNAL_TEST_URL ?? "http://localhost:3102";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname));
const store = new DaylioMemoryStore();
const today = store.bootstrap().today;
const oldDate = addDays(today, -70);
for (let i = 0; i <= 70; i += 1) store.saveEntry(addDays(today, -i), { moodId: "mood-good", activityIds: [], completedGoalIds: [] });
const oldDraft = { moodId: "mood-rad", activityIds: ["activity-walk"], completedGoalIds: [], localTime: "21:00", version: 1 };
const browser = await chromium.launch({ headless: true, channel: process.env.JOURNAL_TEST_BROWSER });
try {
  const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
  await context.addInitScript(({ oldDate, oldDraft }) => {
    localStorage.setItem("daymark:active-draft-date:v1", oldDate);
    localStorage.setItem(`daymark:draft:v1:${oldDate}`, JSON.stringify({ logicalDate: oldDate, draft: oldDraft, savedAt: new Date().toISOString() }));
  }, { oldDate, oldDraft });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let releaseDate;
  const dateGate = new Promise((resolve) => { releaseDate = resolve; });
  let failDate = true;
  const writes = [];
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/bootstrap") return route.fulfill({ json: store.bootstrap() });
    if (url.pathname === "/api/calendar") return route.fulfill({ json: { days: [] } });
    if (url.pathname.startsWith("/api/entries/")) {
      const date = url.pathname.split("/").at(-1);
      if (request.method() === "PUT") {
        writes.push({ date, body: request.postDataJSON() });
        return route.fulfill({ json: { entry: store.saveEntry(date, request.postDataJSON()) } });
      }
      if (date === oldDate) await dateGate;
      if (date === today && failDate) return route.fulfill({ status: 503, json: { error: "Temporary failure" } });
      const state = store.getEntryState(date);
      return route.fulfill({ status: state.entry ? 200 : 404, json: state });
    }
    throw new Error(`Unexpected request: ${request.method()} ${url.pathname}`);
  });
  await page.goto(baseURL);
  await page.locator(".inline-loading").waitFor();
  assert.equal(await page.locator(".save-actions .primary-button").isDisabled(), true);
  assert.ok(await page.evaluate((date) => localStorage.getItem(`daymark:draft:v1:${date}`), oldDate));
  assert.equal(writes.length, 0);
  releaseDate();
  await page.locator('.mood-option[aria-pressed="true"]').filter({ hasText: "Rad" }).waitFor();
  assert.equal(await page.locator('input[type="date"]').inputValue(), oldDate);
  assert.equal(await page.getByRole("button", { name: "Saved", exact: true }).isDisabled(), true);
  assert.equal(await page.evaluate((date) => localStorage.getItem(`daymark:draft:v1:${date}`), oldDate), null);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].body.expectedVersion, 1);
  assert.equal(store.getEntry(oldDate).version, 2);

  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.getByRole("button", { name: "Retry day", exact: true }).waitFor();
  assert.equal(await page.locator(".mood-option:not(:disabled)").count(), 0);
  assert.equal(await page.locator(".save-actions .primary-button").isDisabled(), true);
  assert.equal(await page.locator('.mood-option[aria-pressed="true"]').count(), 0);
  failDate = false;
  await page.getByRole("button", { name: "Retry day", exact: true }).click();
  await page.locator(".mood-option:not(:disabled)").first().waitFor();
  assert.equal((await page.locator('.mood-option[aria-pressed="true"]').innerText()).includes("Good"), true);

  assert.equal(await page.getByRole("button", { name: "Saved", exact: true }).isDisabled(), true);
  assert.equal(writes.length, 1);
  assert.deepEqual(errors, []);
  console.log("PASS: interrupted choices recover automatically, existing entries show Saved, and loading failures disable save.");
} finally {
  await browser.close();
}
