import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { LogPageObject } from "./log-page-object.js";

test.use({ hasTouch: true });

test.describe("swipe between days", () => {
  test("should open the previous day with a swipe to the right, and the next day with a swipe to the left", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    await log.goto();
    const today = await log.currentDate();
    const yesterday = LogPageObject.addDays(today, -1);

    await log.swipeDateSwitcher({ dx: 120 });

    await log.waitForDay(yesterday);
    await expect(log.heading).toHaveText("How was yesterday?");
    await expect(log.dayLabel(yesterday)).toBeVisible();
    await log.swipeDateSwitcher({ dx: -120 });
    await log.waitForDay(today);
    await expect(log.heading).toHaveText("How was your day?");
    await expect(log.dayLabel(today)).toBeVisible();
  });

  test("should not open a day that has not started", async ({ page }) => {
    const log = new LogPageObject(page);
    await log.goto();
    const today = await log.currentDate();

    await log.swipeDateSwitcher({ dx: -120 });

    await expect(log.dayLabel(today)).toBeVisible();
    await expect(log.heading).toHaveText("How was your day?");
    // A later swipe works, so the first one did not leave the page stuck.
    await log.swipeDateSwitcher({ dx: 120 });
    await log.waitForDay(LogPageObject.addDays(today, -1));
  });

  test("should not change the day for a drag that is mostly vertical", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    await log.goto();
    const today = await log.currentDate();

    // Long enough to count, but more vertical than horizontal: a page scroll.
    await log.swipeDateSwitcher({ dx: 60, dy: 100 });

    await expect(log.dayLabel(today)).toBeVisible();
    await expect(log.heading).toHaveText("How was your day?");
  });

  // A vertical drag can leave the page scrolling, so it is not in this test:
  // a swipe during the scroll can count as part of it.
  test("should not change the day for a short swipe, and change it for a long one after", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    await log.goto();
    const today = await log.currentDate();
    const yesterday = LogPageObject.addDays(today, -1);

    await log.swipeDateSwitcher({ dx: 30 });

    await expect(log.dayLabel(today)).toBeVisible();
    await expect(log.heading).toHaveText("How was your day?");
    await log.swipeDateSwitcher({ dx: 120 });
    await log.waitForDay(yesterday);
    await expect(log.dayLabel(yesterday)).toBeVisible();
  });
});
