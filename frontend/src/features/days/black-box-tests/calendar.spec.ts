import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { NavigationPageObject } from "../../core/black-box-tests/navigation-page-object.js";
import { CalendarPageObject } from "./calendar-page-object.js";
import { LogPageObject } from "./log-page-object.js";

test.describe("calendar", () => {
  test("should mark a saved day with its mood, and label an empty day as empty", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    const calendar = new CalendarPageObject(page);
    await log.goto();
    const today = await log.currentDate();
    const yesterday = LogPageObject.addDays(today, -1);
    await log.logDay({ mood: "Rad" });
    await log.goToPreviousDay();
    await log.chooseMood("Bad");

    await calendar.open();

    await expect(calendar.day(today)).toHaveAccessibleName(
      `${LogPageObject.friendlyDate(today)}, Rad mood, entry exists`,
    );
    await expect(calendar.day(yesterday)).toHaveAccessibleName(
      `${LogPageObject.friendlyDate(yesterday)}, empty`,
    );
  });

  test("should show the current month, and no later month", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    const calendar = new CalendarPageObject(page);
    await log.goto();
    const today = await log.currentDate();
    const month = new Intl.DateTimeFormat("en", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${today}T12:00:00Z`));

    await calendar.open();

    await expect(calendar.monthHeading).toHaveText(month);
    await expect(calendar.nextMonthButton).toBeDisabled();
    await expect(calendar.day(today)).toBeEnabled();
    await expect(
      new NavigationPageObject(page).title("Your calendar"),
    ).toBeVisible();
  });

  test("should show an earlier month, and come back to the current one", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    const calendar = new CalendarPageObject(page);
    await log.goto();
    const today = await log.currentDate();
    await calendar.open();
    const current = await calendar.monthHeading.innerText();

    await calendar.showPreviousMonth();

    await expect(calendar.monthHeading).not.toHaveText(current);
    await expect(calendar.nextMonthButton).toBeEnabled();
    await expect(calendar.day(today)).toBeHidden();
    await calendar.nextMonthButton.click();
    await expect(calendar.monthHeading).toHaveText(current);
    await expect(calendar.day(today)).toBeVisible();
  });

  test("should not let the owner open a day that has not started", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    const calendar = new CalendarPageObject(page);
    await log.goto();
    const today = await log.currentDate();
    await calendar.open();

    await expect(calendar.openableDay(today)).toHaveCount(1);
    await expect(
      calendar.openableDay(LogPageObject.addDays(today, 1)),
    ).toHaveCount(0);
    await expect(
      calendar.openableDay(LogPageObject.addDays(today, 3)),
    ).toHaveCount(0);
  });

  test("should open the log of a day that the owner selects", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    const calendar = new CalendarPageObject(page);
    await log.goto();
    const today = await log.currentDate();
    await log.logDay({
      mood: "Good",
      activities: [{ group: "Home", name: "Chores" }],
    });
    await calendar.open();

    await calendar.openDay(today);

    await expect(log.dateField).toHaveValue(today);
    await expect(log.chosenMood("Good")).toBeVisible();
    await expect(log.selectedActivity("Chores")).toBeVisible();
    await expect(log.saveTitle).toHaveText("Your entry is saved");
  });

  test("should open an earlier day from the calendar", async ({ page }) => {
    const log = new LogPageObject(page);
    const calendar = new CalendarPageObject(page);
    await log.goto();
    const earlier = LogPageObject.addDays(await log.currentDate(), -1);
    await log.goToDay(earlier);
    await log.logDay({ mood: "Awful" });
    await calendar.open();
    await expect(calendar.day(earlier)).toHaveAccessibleName(
      `${LogPageObject.friendlyDate(earlier)}, Awful mood, entry exists`,
    );

    await calendar.openDay(earlier);

    await expect(log.dateField).toHaveValue(earlier);
    await expect(log.chosenMood("Awful")).toBeVisible();
  });
});
