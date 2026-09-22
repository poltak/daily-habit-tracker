// Run against a local dev server with Playwright available through NODE_PATH.
// This exercises the visible-tab refresh path with synthetic API responses.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DaylioMemoryStore } from "../../lib/daylio.ts";

const { chromium } = createRequire(import.meta.url)("playwright");
const baseURL = process.env.JOURNAL_TEST_URL ?? "http://localhost:3102";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname));

const store = new DaylioMemoryStore();
const today = store.bootstrap().today;
const browser = await chromium.launch({ headless: true, channel: process.env.JOURNAL_TEST_BROWSER });

try {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  let entryGets = 0;
  let releaseRefresh;
  let releaseFailedRefresh;
  let releaseMood;
  let failNextMood = false;
  let moodRequests = 0;
  let refreshStartedResolve;
  let failedRefreshStartedResolve;
  const refreshGate = new Promise((resolve) => { releaseRefresh = resolve; });
  const failedRefreshGate = new Promise((resolve) => { releaseFailedRefresh = resolve; });
  const moodGate = new Promise((resolve) => { releaseMood = resolve; });
  const refreshStarted = new Promise((resolve) => { refreshStartedResolve = resolve; });
  const failedRefreshStarted = new Promise((resolve) => { failedRefreshStartedResolve = resolve; });

  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/bootstrap") return route.fulfill({ json: store.bootstrap() });
    if (url.pathname.startsWith("/api/entries/") && request.method() === "GET") {
      entryGets += 1;
      if (entryGets === 3) {
        refreshStartedResolve();
        const staleState = store.getEntryState(today);
        await refreshGate;
        return route.fulfill({ status: 404, json: staleState });
      }
      if (entryGets === 4) {
        failedRefreshStartedResolve();
        await failedRefreshGate;
        return route.fulfill({ status: 503, json: { error: "Temporary refresh failure." } });
      }
      const state = store.getEntryState(today);
      return route.fulfill({ status: state.entry ? 200 : 404, json: state });
    }
    if (url.pathname.endsWith(`/api/day-selections/${today}/mood`) && request.method() === "PUT") {
      moodRequests += 1;
      if (failNextMood) return route.fulfill({ status: 503, json: { error: "Temporary mood failure." } });
      await moodGate;
      const moodId = request.postDataJSON().moodId;
      store.setMoodSelection(today, moodId);
      return route.fulfill({ json: { selection: { logicalDate: today, moodId } } });
    }
    throw new Error(`Unexpected request: ${request.method()} ${url.pathname}`);
  });

  await page.goto(baseURL);
  await page.locator('.mood-option[aria-pressed="false"]').first().waitFor();
  assert.equal(entryGets, 1);

  // A clean visible-tab refresh applies a state changed on the server.
  store.setMoodSelection(today, "mood-meh");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.locator('.mood-option[aria-pressed="true"]').filter({ hasText: "Meh" }).waitFor();
  assert.equal(entryGets, 2);

  // A response that started before a local mutation must not overwrite the
  // optimistic selection.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await refreshStarted;

  await page.getByRole("button", { name: /Rad/ }).click();
  await page.locator('.mood-option[aria-busy="true"]').waitFor();
  const warnsBeforeUnload = () => page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert.equal(await warnsBeforeUnload(), true);
  const firstMoodResponse = page.waitForResponse((response) => response.url().includes(`/api/day-selections/${today}/mood`) && response.request().method() === "PUT");
  releaseMood();
  await firstMoodResponse;
  await page.waitForFunction(() => document.querySelectorAll('.mood-option[aria-busy="true"]').length === 0);
  assert.equal(await warnsBeforeUnload(), false);
  const staleResponse = page.waitForResponse((response) => response.url().includes(`/api/entries/${today}`) && response.request().method() === "GET");
  releaseRefresh();
  await staleResponse;
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator('.mood-option[aria-pressed="true"]').filter({ hasText: "Rad" }).count(), 1);
  assert.equal(moodRequests, 1);

  // A failed refresh from before a successful local write must not report a
  // sync issue after the write completes.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await failedRefreshStarted;
  await page.getByRole("button", { name: /Good/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.mood-option[aria-busy="true"]').length === 0);
  const failedRefreshResponse = page.waitForResponse((response) => response.url().includes(`/api/entries/${today}`) && response.status() === 503);
  releaseFailedRefresh();
  await failedRefreshResponse;
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator('.mood-option[aria-pressed="true"]').filter({ hasText: "Good" }).count(), 1);
  assert.match(await page.locator(".connection-pill").getAttribute("class"), /online/);

  // A failed local write restores the confirmed value, and a later refresh
  // can still apply a newer server value.
  failNextMood = true;
  await page.getByRole("button", { name: /Meh/ }).click();
  await page.getByText(/The mood was restored\./).waitFor();
  assert.equal(await page.locator('.mood-option[aria-pressed="true"]').filter({ hasText: "Good" }).count(), 1);
  store.setMoodSelection(today, "mood-meh");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.locator('.mood-option[aria-pressed="true"]').filter({ hasText: "Meh" }).waitFor();
  assert.equal(entryGets, 5);
  assert.equal(moodRequests, 3);
  console.log("PASS: server state refreshes; stale responses stay safe and failed writes do not block later refreshes.");
} finally {
  await browser.close();
}
