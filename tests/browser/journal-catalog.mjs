// All API responses are synthetic. No saved journal data is read or changed.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DaylioMemoryStore } from "../../lib/daylio.ts";

const { chromium } = createRequire(import.meta.url)("playwright");
const baseURL = process.env.JOURNAL_TEST_URL ?? "http://localhost:3102";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname));
const store = new DaylioMemoryStore();
for (const group of store.bootstrap().groups) store.updateGroup(group.id, { sortOrder: 0 });
const browser = await chromium.launch({ headless: true, channel: process.env.JOURNAL_TEST_BROWSER });
try {
  const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
  let failRefresh = false;
  let failReorder = false;
  let creations = 0;
  let reorders = 0;
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/bootstrap") return route.fulfill(failRefresh ? { status: 503, json: { error: "Refresh unavailable" } } : { json: store.bootstrap() });
    if (url.pathname.startsWith("/api/entries/")) return route.fulfill({ status: 404, json: store.getEntryState(url.pathname.split("/").at(-1)) });
    if (url.pathname === "/api/catalog/reorder") {
      reorders += 1;
      if (failReorder) return route.fulfill({ status: 503, json: { error: "Reorder unavailable" } });
      store.reorderCatalog(request.postDataJSON());
      return route.fulfill({ json: { success: true } });
    }
    if (url.pathname === "/api/catalog" && request.method() === "POST") {
      creations += 1;
      const { name, groupId, icon } = request.postDataJSON();
      failRefresh = true;
      return route.fulfill({ status: 201, json: { activity: store.createActivity(name, groupId, icon) } });
    }
    throw new Error(`Unexpected request: ${request.method()} ${url.pathname}`);
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseURL);
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("button", { name: "Setup", exact: true }).click();
  await page.getByRole("button", { name: "Move Health down", exact: true }).click();
  await page.getByRole("button", { name: "Move Health up", exact: true }).waitFor();
  assert.equal(reorders, 1);
  assert.deepEqual(store.bootstrap().groups.slice(0, 2).map((group) => group.name), ["Work", "Health"]);
  const groupRows = page.locator(".settings-card").filter({ has: page.getByText("Activity groups", { exact: true }) }).locator(".management-copy strong");
  assert.deepEqual((await groupRows.allTextContents()).slice(0, 2), ["Work", "Health"]);
  failReorder = true;
  await page.getByRole("button", { name: "Move Health up", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Reorder unavailable" }).waitFor();
  assert.deepEqual((await groupRows.allTextContents()).slice(0, 2), ["Work", "Health"]);

  await page.getByRole("button", { name: "Add new activity to Health", exact: true }).click();
  await page.getByPlaceholder("Activity name", { exact: true }).fill("Audit activity");
  await page.getByRole("button", { name: "Add activity", exact: true }).click();
  await page.getByRole("button", { name: "Retry refresh", exact: true }).waitFor();
  assert.equal(creations, 1);
  assert.equal(await page.getByPlaceholder("Activity name", { exact: true }).isDisabled(), true);
  failRefresh = false;
  await page.getByRole("button", { name: "Retry refresh", exact: true }).click();
  await page.getByRole("textbox", { name: "Filter activities to manage" }).waitFor();
  assert.equal(creations, 1);
  assert.equal(store.bootstrap().activities.filter((activity) => activity.name === "Audit activity").length, 1);
  assert.deepEqual(errors, []);
  console.log("PASS: atomic catalog reorder, rollback, and activity refresh retry without a duplicate POST.");
} finally {
  await browser.close();
}
