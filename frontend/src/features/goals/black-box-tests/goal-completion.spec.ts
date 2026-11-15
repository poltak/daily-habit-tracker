import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { LogPageObject } from "../../days/black-box-tests/log-page-object.js";

const GYM = { group: "Health", name: "Gym" };
const READING = { group: "Leisure", name: "Reading" };

test.describe("complete goals on a day", () => {
  test("should list the goals with their schedule and the activity they follow", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    await log.goto();

    await expect(log.goalDescription("3 days this week · Gym")).toBeVisible();
    await expect(log.goalDescription("Every day · Reading")).toBeVisible();
    await expect(log.goalCount).toHaveText("0/2");
    await expect(log.openGoalSwitch("Move your body")).toBeVisible();
    await expect(log.openGoalSwitch("Read")).toBeVisible();
  });

  test("should complete a goal and keep it after a reload", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    await log.goto();

    await log.completeGoal("Read");

    await expect(log.goalCount).toHaveText("1/2");
    await log.goto();
    await expect(log.doneGoalSwitch("Read")).toBeVisible();
    await expect(log.openGoalSwitch("Move your body")).toBeVisible();
    await expect(log.goalCount).toHaveText("1/2");
  });

  test("should take back a completed goal", async ({ page }) => {
    const log = new LogPageObject(page);
    await log.goto();
    await log.completeGoal("Read");

    await log.uncompleteGoal("Read");

    await expect(log.goalCount).toHaveText("0/2");
    await log.goto();
    await expect(log.openGoalSwitch("Read")).toBeVisible();
  });

  test("should select the activity of a goal when the owner completes the goal", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    await log.goto();

    await log.completeGoal("Read");

    await expect(log.selectedActivity("Reading")).toBeVisible();
    await expect(log.selectedCount("1 selected")).toBeVisible();
    await log.uncompleteGoal("Read");
    await expect(log.selectedActivity("Reading")).toBeHidden();
    await expect(log.selectedActivitiesEmpty).toBeVisible();
  });

  test("should complete the goal of an activity when the owner selects the activity", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    await log.goto();

    await log.toggleActivity(GYM);

    await expect(log.doneGoalSwitch("Move your body")).toBeVisible();
    await expect(log.goalCount).toHaveText("1/2");
    await log.toggleActivity(GYM);
    await expect(log.openGoalSwitch("Move your body")).toBeVisible();
    await expect(log.goalCount).toHaveText("0/2");
  });

  test("should save the completed goals with the day", async ({ page }) => {
    const log = new LogPageObject(page);
    await log.goto();
    await log.toggleActivity(READING);
    await log.logDay({ mood: "Good" });

    await log.goto();

    await expect(log.doneGoalSwitch("Read")).toBeVisible();
    await expect(log.saveTitle).toHaveText("Your entry is saved");
  });

  test("should keep the goals of each day apart", async ({ page }) => {
    const log = new LogPageObject(page);
    await log.goto();
    const today = await log.currentDate();
    await log.completeGoal("Read");

    await log.goToPreviousDay();
    await expect(log.openGoalSwitch("Read")).toBeVisible();
    await expect(log.goalCount).toHaveText("0/2");
    await log.completeGoal("Move your body");
    await log.goToDay(today);

    await expect(log.doneGoalSwitch("Read")).toBeVisible();
    await expect(log.openGoalSwitch("Move your body")).toBeVisible();
  });

  test("should not update a goal while offline", async ({ page, context }) => {
    const log = new LogPageObject(page);
    await log.goto();

    await context.setOffline(true);
    await log.openGoalSwitch("Read").click();

    await expect(
      log.notice("You’re offline. Reconnect before updating a goal."),
    ).toBeVisible();
    await expect(log.openGoalSwitch("Read")).toBeVisible();
    await context.setOffline(false);
    await log.completeGoal("Read");
  });
});
