// Run: node --experimental-strip-types tests/browser/journal-navigation.mjs
// Use a local build with Playwright available (or set NODE_PATH).
// Set JOURNAL_TEST_BROWSER=chrome to use an installed Chrome browser.
// All API responses use test fixtures; no journal data is read or written.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DaylioMemoryStore } from "../../lib/daylio.ts";

const { chromium } = createRequire(import.meta.url)("playwright");
const baseURL = process.env.JOURNAL_TEST_URL ?? "http://localhost:3101";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname));
const bootstrap = new DaylioMemoryStore().bootstrap();
const browser = await chromium.launch({ headless: true, channel: process.env.JOURNAL_TEST_BROWSER });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let bootstrapRequests = 0;
  let failBootstrap = false;
  let releaseBootstrap;
  const initialBootstrap = new Promise((resolve) => { releaseBootstrap = resolve; });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/bootstrap") {
      bootstrapRequests += 1;
      if (bootstrapRequests === 1) await initialBootstrap;
      return route.fulfill({ status: failBootstrap ? 503 : 200, json: failBootstrap ? {} : bootstrap });
    }
    if (path.startsWith("/api/entries/")) return route.fulfill({ status: 404, json: { completedGoalIds: [] } });
    if (path === "/api/calendar") return route.fulfill({ json: { days: [] } });
    throw new Error(`Unexpected API request: ${route.request().method()} ${path}`);
  });

  await page.goto(baseURL);
  await page.locator(".journal-loading").waitFor();
  assert.equal(await page.getByRole("navigation", { name: "Primary navigation" }).isVisible(), true);
  assert.equal(await page.getByRole("heading", { name: "How did your day feel?" }).isVisible(), true);
  assert.equal(await page.getByText("Opening your journal…").count(), 0);
  assert.equal(await page.locator(".mood-option").count(), 0);
  await page.screenshot({ path: "/tmp/daymark-loading-mobile.png", fullPage: true });
  releaseBootstrap();
  await page.locator(".mood-option:not(:disabled)").first().waitFor();
  await page.getByRole("button", { name: "Yesterday", exact: true }).click();
  await page.locator(".mood-option:not(:disabled)").first().waitFor();
  const search = page.getByPlaceholder("Search your activities");
  await search.fill("walk");

  // Record any transient loading shell, not just the final screen.
  await page.evaluate(() => {
    window.journalLoadingFlashes = 0;
    new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node instanceof Element && (node.matches(".journal-loading") || node.querySelector(".journal-loading"))) window.journalLoadingFlashes += 1;
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  await nav.getByRole("button", { name: "Calendar", exact: true }).click();
  await page.waitForURL(/view=calendar/);
  await page.goBack();
  await search.waitFor();
  assert.equal(await search.inputValue(), "walk");
  assert.equal(await page.locator('input[type="date"]').inputValue(), bootstrap.yesterday);
  await page.goForward();
  await page.waitForURL(/view=calendar/);
  await nav.getByRole("button", { name: "Log", exact: true }).click();
  await search.waitFor();
  await nav.getByRole("button", { name: "Setup", exact: true }).click();
  await page.waitForURL(/view=settings/);
  await page.goBack();
  await search.waitFor();
  assert.equal(await search.inputValue(), "walk");
  assert.equal(await page.locator('input[type="date"]').inputValue(), bootstrap.yesterday);
  assert.equal(bootstrapRequests, 1);
  assert.equal(await page.evaluate(() => window.journalLoadingFlashes), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  failBootstrap = true;
  await page.reload();
  await page.getByRole("button", { name: "Retry", exact: true }).waitFor();
  assert.equal(await page.getByRole("alert").isVisible(), true);
  failBootstrap = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.locator(".mood-option:not(:disabled)").first().waitFor();
  assert.equal(bootstrapRequests, 3);
  assert.equal(await page.getByRole("alert").count(), 0);
  assert.deepEqual(errors, []);
  console.log("PASS: mobile first-load placeholders, retained date and search, Back/Forward, no extra bootstrap or loading flashes, error and retry.");
} finally {
  await browser.close();
}
