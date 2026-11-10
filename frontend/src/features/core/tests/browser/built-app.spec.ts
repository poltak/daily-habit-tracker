import { APP_NAME } from "@app/common/features/core/utils/app-name";
import { expect, test, type Page } from "@playwright/test";
import { SET_UP_HEADING, setUp, startVisit } from "./built-app-visit.js";

// These tests are one visit to the built app, in one page, on the Worker that
// serves the API and the frontend. They run on the `next` target only. Each
// test starts where the test before it ended, and a failure skips the tests
// after it.
test.describe.configure({ mode: "serial" });

// An address with no route in the router. The Worker answers it with the app
// and status 404, and the app shows its "Page not found" page.
const MISSING_PAGE = "/no-such-page";

let visit: Awaited<ReturnType<typeof startVisit>>;
let page: Page;

test.beforeAll(async ({ browser, baseURL }) => {
  visit = await startVisit({ browser, baseURL: baseURL ?? "" });
  ({ page } = visit);
});

test.afterAll(() => visit.end());

test("should send a visitor without a session to the sign-in page", async () => {
  // The Worker must also answer an app page that is not a file with the app.
  await page.goto(MISSING_PAGE);

  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page).toHaveTitle(APP_NAME);
  await expect(
    page.getByRole("heading", { name: SET_UP_HEADING }),
  ).toBeVisible();
});

test("should save the first passkey, and return to the page that the visitor asked for", async () => {
  await setUp({ page });

  await expect(page).toHaveURL(new RegExp(`${MISSING_PAGE}$`));
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
});

test("should keep the session across a reload", async () => {
  // After a reload, the page has only what the browser and the Worker kept.
  await page.reload();

  await expect(page).toHaveURL(new RegExp(`${MISSING_PAGE}$`));
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toBeVisible();
});

test("should open another page from a link without a page load", async () => {
  let pageLoads = 0;
  page.on("load", () => (pageLoads += 1));

  await page.getByRole("button", { name: "Go to log" }).click();

  await expect(page).not.toHaveURL(new RegExp(`${MISSING_PAGE}$`));
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeHidden();
  expect(pageLoads).toEqual(0);
  expect(visit.uncaughtErrors).toEqual([]);
});

test("should sign the owner out, and ask for sign-in again", async () => {
  await page.getByRole("button", { name: "Setup", exact: true }).click();
  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page).toHaveURL(/\/sign-in$/);

  await page.goto(MISSING_PAGE);

  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(
    page.getByRole("button", { name: "Sign in with passkey" }),
  ).toBeVisible();
});
