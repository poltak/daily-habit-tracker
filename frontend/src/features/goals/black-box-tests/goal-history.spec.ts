import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { LogPageObject } from "../../days/black-box-tests/log-page-object.js";
import { GoalPageObject } from "./goal-page-object.js";

test.describe("goal history", () => {
  test("should mark the days on which the goal was completed", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    const goal = new GoalPageObject(page);
    await log.goto();
    const today = await log.currentDate();
    await log.completeGoal("Read");

    await goal.openFromLog("Read");

    await expect(goal.day(today, "completed")).toBeVisible();
    await expect(
      goal.day(
        LogPageObject.addDays(GoalPageObject.weekStart(today), -1),
        "completed",
      ),
    ).toBeHidden();
    await expect(
      goal.explainer(
        "Green days are completed; pale days are not completed. A dash marks an expected day.",
      ),
    ).toBeVisible();
  });

  test("should count the completed days of the week that is going on", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    const goal = new GoalPageObject(page);
    await log.goto();
    const today = await log.currentDate();
    const weekStart = GoalPageObject.weekStart(today);
    await log.completeGoal("Move your body");

    await goal.openFromLog("Move your body");

    await expect(goal.week(weekRange(weekStart))).toContainText(
      "In progress · 1/3 days",
    );
  });

  test("should call a week accomplished when it has enough completed days, and not accomplished when it has not", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    const goal = new GoalPageObject(page);
    await log.goto();
    const lastWeek = LogPageObject.addDays(
      GoalPageObject.weekStart(await log.currentDate()),
      -7,
    );
    for (const offset of [0, 1, 2]) {
      await log.goToDay(LogPageObject.addDays(lastWeek, offset));
      await log.completeGoal("Move your body");
    }
    await log.goToDay(LogPageObject.addDays(lastWeek, 3));
    await log.completeGoal("Read");

    await log.goToDay(lastWeek);
    await goal.openFromLog("Move your body");

    await expect(goal.week(weekRange(lastWeek))).toContainText(
      "Accomplished · 3/3 days",
    );
    await expect(goal.day(lastWeek, "completed")).toBeVisible();
    await expect(
      goal.day(LogPageObject.addDays(lastWeek, 3), "completed"),
    ).toBeHidden();
    await goal.goBack();
    await goal.openFromLog("Read");
    await expect(goal.week(weekRange(lastWeek))).toContainText(
      "Not accomplished",
    );
    await expect(
      goal.day(LogPageObject.addDays(lastWeek, 3), "completed"),
    ).toBeVisible();
  });

  test("should show an earlier month and come back", async ({ page }) => {
    const log = new LogPageObject(page);
    const goal = new GoalPageObject(page);
    await log.goto();
    await goal.openFromLog("Read");
    const current = await goal.monthHeading.innerText();

    await goal.previousMonthButton.click();
    await expect(goal.monthHeading).not.toHaveText(current);
    await goal.nextMonthButton.click();

    await expect(goal.monthHeading).toHaveText(current);
  });
});

/** The dates of a week as the page writes them, such as "Nov 2 – Nov 8". */
function weekRange(start: string): string {
  return `${LogPageObject.shortDate(start)} – ${LogPageObject.shortDate(LogPageObject.addDays(start, 6))}`;
}
