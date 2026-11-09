import { expect } from "@playwright/test";
import { test } from "./black-box-test.js";
import { CalendarPageObject } from "../../days/black-box-tests/calendar-page-object.js";
import { LogPageObject } from "../../days/black-box-tests/log-page-object.js";
import { InsightsPageObject } from "../../insights/black-box-tests/insights-page-object.js";
import { SetupPageObject } from "../../settings/black-box-tests/setup-page-object.js";
import { NavigationPageObject } from "./navigation-page-object.js";

test.describe("navigation", () => {
  test("should open each page from the bottom navigation, and mark the open page", async ({
    page,
  }) => {
    const navigation = new NavigationPageObject(page);
    const log = new LogPageObject(page);
    const calendar = new CalendarPageObject(page);
    const insights = new InsightsPageObject(page);
    const setup = new SetupPageObject(page);
    await log.goto();
    await expect(navigation.button("Log")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(navigation.button("Calendar")).not.toHaveAttribute(
      "aria-current",
      "page",
    );

    await calendar.open();
    await expect(navigation.button("Calendar")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(navigation.button("Log")).not.toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(navigation.title("Your calendar")).toBeVisible();

    await insights.open();
    await expect(navigation.button("Insights")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(navigation.title("Your insights")).toBeVisible();

    await setup.open();
    await expect(navigation.button("Setup")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(navigation.title("Your setup")).toBeVisible();

    await log.open();
    await expect(navigation.button("Log")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(log.heading).toBeVisible();
  });

  test("should open the log with the name of the app in the header", async ({
    page,
  }) => {
    const navigation = new NavigationPageObject(page);
    const log = new LogPageObject(page);
    const setup = new SetupPageObject(page);
    await setup.goto();

    await navigation.brandButton.click();

    await log.waitUntilLoaded();
    await expect(log.heading).toBeVisible();
    await expect(setup.heading).toBeHidden();
  });

  test("should open the page of an address", async ({ page }) => {
    const calendar = new CalendarPageObject(page);
    const insights = new InsightsPageObject(page);
    const setup = new SetupPageObject(page);

    await page.goto("/?view=calendar");
    await expect(calendar.heading).toBeVisible();
    await insights.goto();
    await expect(insights.heading).toBeVisible();
    await setup.goto();
    await expect(setup.heading).toBeVisible();
  });

  test("should go back and forward between pages, and keep the day and the search of the log", async ({
    page,
  }) => {
    const navigation = new NavigationPageObject(page);
    const log = new LogPageObject(page);
    const calendar = new CalendarPageObject(page);
    await log.goto();
    const yesterday = LogPageObject.addDays(await log.currentDate(), -1);
    await log.goToPreviousDay();
    await log.searchActivities("walk");
    await calendar.open();

    await navigation.goBack();

    await expect(log.searchField).toHaveValue("walk");
    await expect(log.dateField).toHaveValue(yesterday);
    await navigation.goForward();
    await expect(calendar.heading).toBeVisible();
  });

  test("should have a link that skips to the content", async ({ page }) => {
    const navigation = new NavigationPageObject(page);
    const log = new LogPageObject(page);
    await log.goto();

    await expect(navigation.skipLink).toHaveAttribute(
      "href",
      "#journal-content",
    );
  });

  test("should show a page-not-found text for an address with no page", async ({
    page,
  }) => {
    const navigation = new NavigationPageObject(page);

    await page.goto("/no-such-page");

    await expect(navigation.notFound).toBeVisible();
  });
});
