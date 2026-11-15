import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { LogPageObject } from "../../days/black-box-tests/log-page-object.js";
import { SetupPageObject } from "../../settings/black-box-tests/setup-page-object.js";
import { GoalPageObject } from "./goal-page-object.js";

test.describe("the start date of a goal", () => {
  test("should not count the days before the day on which the goal was made", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    const log = new LogPageObject(page);
    const goal = new GoalPageObject(page);
    await log.goto();
    const today = await log.currentDate();
    await setup.open();
    await setup.addGoal("Meditate");
    await expect(setup.notice("Setup updated.")).toBeVisible();
    await log.open();

    await goal.openFromLog("Meditate");

    await expect(goal.expectedDay(today, "not completed")).toBeVisible();
    // Each check follows a later one, because the month only goes back.
    for (const back of [1, 3]) {
      const date = LogPageObject.addDays(today, -back);
      await goal.showMonthOf(date);
      await expect(goal.unexpectedDay(date)).toBeVisible();
    }
  });

  test("should count an earlier day that the owner completes from that day", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    const log = new LogPageObject(page);
    const goal = new GoalPageObject(page);
    await log.goto();
    const today = await log.currentDate();
    const earlier = LogPageObject.addDays(today, -3);
    await setup.open();
    await setup.addGoal("Meditate");
    await expect(setup.notice("Setup updated.")).toBeVisible();
    await log.open();
    await log.goToDay(earlier);

    await log.completeGoal("Meditate");

    await goal.openFromLog("Meditate");
    // Each check follows a later one, because the month only goes back.
    const after = LogPageObject.addDays(earlier, 1);
    await goal.showMonthOf(after);
    await expect(goal.expectedDay(after, "not completed")).toBeVisible();
    await goal.showMonthOf(earlier);
    await expect(goal.expectedDay(earlier, "completed")).toBeVisible();
    const before = LogPageObject.addDays(earlier, -1);
    await goal.showMonthOf(before);
    await expect(goal.unexpectedDay(before)).toBeVisible();
  });
});
