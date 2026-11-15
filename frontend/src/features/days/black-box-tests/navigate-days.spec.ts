import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { LogPageObject } from "./log-page-object.js";

test.describe("move between days", () => {
  test("should open yesterday with the previous day button, and today with the next day button", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    await log.goto();
    const today = await log.currentDate();
    const yesterday = LogPageObject.addDays(today, -1);
    await expect(log.nextDayButton).toBeDisabled();

    await log.goToPreviousDay();

    await expect(log.heading).toHaveText("How was yesterday?");
    await expect(log.dayLabel(yesterday)).toBeVisible();
    await expect(log.dateField).toHaveValue(yesterday);
    await expect(log.nextDayButton).toBeEnabled();
    await log.goToNextDay();
    await expect(log.heading).toHaveText("How was your day?");
    await expect(log.dateField).toHaveValue(today);
    await expect(log.nextDayButton).toBeDisabled();
  });

  test("should name an earlier day in the heading", async ({ page }) => {
    const log = new LogPageObject(page);
    await log.goto();
    const earlier = LogPageObject.addDays(await log.currentDate(), -5);

    await log.goToPreviousDay();
    await log.goToPreviousDay();
    await log.goToPreviousDay();
    await log.goToPreviousDay();
    await log.goToPreviousDay();

    await expect(log.heading).toHaveText(
      `How was ${LogPageObject.longDate(earlier)}?`,
    );
    await expect(
      log.saveDetail(`${LogPageObject.friendlyDate(earlier)} · 0 activities`),
    ).toBeVisible();
  });

  test("should open any earlier day with the date field, and come back with Today", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    await log.goto();
    const today = await log.currentDate();
    const earlier = LogPageObject.addDays(today, -40);

    await log.goToDay(earlier);

    await expect(log.heading).toHaveText(
      `How was ${LogPageObject.longDate(earlier)}?`,
    );
    await expect(log.dateField).toHaveValue(earlier);
    await log.goToToday();
    await expect(log.heading).toHaveText("How was your day?");
    await expect(log.dateField).toHaveValue(today);
  });

  test("should keep a separate entry for each day", async ({ page }) => {
    const log = new LogPageObject(page);
    await log.goto();
    const today = await log.currentDate();
    const yesterday = LogPageObject.addDays(today, -1);
    await log.logDay({
      mood: "Good",
      activities: [{ group: "Health", name: "Walk" }],
    });
    await log.goToPreviousDay();
    await expect(log.saveTitle).toHaveText("Ready to save your day?");
    await expect(log.chosenMood("Good")).toBeHidden();
    await log.logDay({ mood: "Bad" });

    await log.goToToday();
    await expect(log.chosenMood("Good")).toBeVisible();
    await expect(log.selectedActivity("Walk")).toBeVisible();
    await log.goToDay(yesterday);
    await expect(log.chosenMood("Bad")).toBeVisible();
    await expect(log.selectedActivity("Walk")).toBeHidden();
    await expect(log.saveTitle).toHaveText("Your entry is saved");
  });

  test("should keep a mood that the owner chose on an earlier day before the entry is saved", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    await log.goto();
    const earlier = LogPageObject.addDays(await log.currentDate(), -3);
    await log.goToDay(earlier);
    await log.chooseMood("Meh");

    await log.goToToday();
    await log.goToDay(earlier);

    await expect(log.chosenMood("Meh")).toBeVisible();
    await expect(log.saveTitle).toHaveText("Ready to save your day?");
  });

  test("should open today again after a reload of an earlier day", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    await log.goto();
    const today = await log.currentDate();
    await log.goToDay(LogPageObject.addDays(today, -2));

    await log.goto();

    await expect(log.dateField).toHaveValue(today);
    await expect(log.heading).toHaveText("How was your day?");
  });

  test("should not open a day that has not started", async ({ page }) => {
    const log = new LogPageObject(page);
    await log.goto();
    const today = await log.currentDate();

    await log.tryDay(LogPageObject.addDays(today, 2));

    await expect(log.dateField).toHaveValue(today);
    await expect(log.heading).toHaveText("How was your day?");
    await expect(log.nextDayButton).toBeDisabled();
  });
});
