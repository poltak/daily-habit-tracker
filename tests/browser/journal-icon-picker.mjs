// All API responses are synthetic. No saved journal data is read or changed.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DaylioMemoryStore } from "../../lib/daylio.ts";
import { ACTIVITY_ICON_CHOICES } from "../../lib/icons.ts";

const { chromium } = createRequire(import.meta.url)("playwright");
const baseURL = process.env.JOURNAL_TEST_URL ?? "http://localhost:3102";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname));
const store = new DaylioMemoryStore();
const browser = await chromium.launch({ headless: true, channel: process.env.JOURNAL_TEST_BROWSER });
try {
  const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/bootstrap") return route.fulfill({ json: store.bootstrap() });
    if (url.pathname.startsWith("/api/entries/")) return route.fulfill({ status: 404, json: store.getEntryState(url.pathname.split("/").at(-1)) });
    if (url.pathname.startsWith("/api/catalog/activity/") && request.method() === "PATCH") {
      return route.fulfill({ json: { activity: store.updateActivity(url.pathname.split("/").at(-1), request.postDataJSON()) } });
    }
    throw new Error(`Unexpected request: ${request.method()} ${url.pathname}`);
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseURL);
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("button", { name: "Setup", exact: true }).click();
  await page.getByRole("textbox", { name: "Filter activities to manage" }).fill("Gym");
  await page.getByRole("button", { name: "Choose icon for Gym", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Choose an icon" });
  await dialog.waitFor();
  assert.equal(await dialog.locator(".icon-choice").count(), 120);
  await dialog.getByRole("button", { name: "Show more icons", exact: true }).click();
  assert.equal(await dialog.locator(".icon-choice").count(), 240);
  const search = dialog.getByRole("textbox", { name: "Search icons" });
  await search.fill("Health");
  assert.ok(await dialog.locator(".icon-choice").count() > 0);
  const rareIcon = ACTIVITY_ICON_CHOICES.at(-1).name;
  await search.fill(rareIcon.replaceAll("_", " "));
  await dialog.getByRole("button", { name: `Use ${rareIcon.replaceAll("_", " ")} icon`, exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(store.bootstrap().activities.find((activity) => activity.id === "activity-gym").icon, rareIcon);
  assert.deepEqual(errors, []);
  console.log(`PASS: icon picker renders 120 of ${ACTIVITY_ICON_CHOICES.length} icons, loads more, and searches the full set.`);
} finally {
  await browser.close();
}
