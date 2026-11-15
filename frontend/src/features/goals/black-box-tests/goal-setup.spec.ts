import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { IconPickerPageObject } from "../../catalog/black-box-tests/icon-picker-page-object.js";
import { LogPageObject } from "../../days/black-box-tests/log-page-object.js";
import { SetupPageObject } from "../../settings/black-box-tests/setup-page-object.js";
import { GoalPageObject } from "./goal-page-object.js";

test.describe("set up goals", () => {
  test("should add a goal with a daily schedule and no activity", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    const log = new LogPageObject(page);
    await setup.goto();
    await expect(setup.goalsHeading("2 active · 2 total")).toBeVisible();

    await setup.addGoal("Meditate");

    await expect(setup.notice("Setup updated.")).toBeVisible();
    await expect(setup.goalsHeading("3 active · 3 total")).toBeVisible();
    await expect(
      setup.goalDetail("Every day · No associated activity"),
    ).toBeVisible();
    await expect(setup.newGoalField).toHaveValue("");
    await log.open();
    await expect(log.openGoalSwitch("Meditate")).toBeVisible();
    await expect(log.goalDescription("Every day")).toBeVisible();
    await expect(log.goalCount).toHaveText("0/3");
  });

  test("should name a goal with no name Activity goal", async ({ page }) => {
    const setup = new SetupPageObject(page);
    await setup.goto();

    await setup.addGoal("  ");

    await expect(setup.goalsHeading("3 active · 3 total")).toBeVisible();
    await expect(setup.configureButton("Activity goal")).toBeVisible();
  });

  test("should change the name, the schedule, and the activity of a goal", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    const goal = new GoalPageObject(page);
    const log = new LogPageObject(page);
    await setup.goto();
    await goal.openFromSetup("Read");
    await expect(goal.saveButton).toBeDisabled();

    await goal.rename("Read a chapter");
    await expect(goal.unsavedNote).toBeVisible();
    await goal.chooseRepeat("Weekly");
    await goal.daysPerWeek("5 days per week").check();
    await goal.chooseActivity("Music");
    await goal.save();

    await expect(goal.heading("Read a chapter")).toBeVisible();
    await expect(goal.unsavedNote).toBeHidden();
    await expect(goal.saveButton).toBeDisabled();
    await expect(
      goal.explainer("Each week needs 5 completed days."),
    ).toBeVisible();
    await goal.goBack();
    await expect(setup.goalDetail("5 days per week · Music")).toBeVisible();
    await log.open();
    await expect(log.goalDescription("5 days this week · Music")).toBeVisible();
    await expect(log.openGoalSwitch("Read a chapter")).toBeVisible();
  });

  test("should set the weekdays of a daily goal", async ({ page }) => {
    const setup = new SetupPageObject(page);
    const goal = new GoalPageObject(page);
    const log = new LogPageObject(page);
    await setup.goto();
    await goal.openFromSetup("Read");
    await expect(goal.weekday("Mon")).toBeChecked();
    await expect(goal.weekday("Sun")).toBeChecked();

    await goal.weekday("Sat").uncheck();
    await goal.weekday("Sun").uncheck();
    await goal.save();

    await goal.goBack();
    await expect(setup.goalDetail("Selected weekdays · Reading")).toBeVisible();
    await log.open();
    await expect(
      log.goalDescription("Selected weekdays · Reading"),
    ).toBeVisible();
    await log.openGoal("Read");
    await expect(goal.weekday("Sat")).not.toBeChecked();
    await expect(goal.weekday("Fri")).toBeChecked();
  });

  test("should refuse a goal with no name or no weekday", async ({ page }) => {
    const setup = new SetupPageObject(page);
    const goal = new GoalPageObject(page);
    await setup.goto();
    await goal.openFromSetup("Read");

    await goal.rename("   ");
    await goal.trySave();
    await expect(goal.notice("Goal name is required.")).toBeVisible();

    await goal.rename("Read");
    for (const day of [
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ] as const) {
      await goal.weekday(day).uncheck();
    }
    await goal.trySave();
    await expect(
      goal.notice("Choose at least one weekday for a daily goal."),
    ).toBeVisible();
    await goal.weekday("Wed").check();
    await goal.save();
  });

  test("should link a goal to no activity", async ({ page }) => {
    const setup = new SetupPageObject(page);
    const goal = new GoalPageObject(page);
    await setup.goto();
    await goal.openFromSetup("Move your body");
    await expect(goal.activityField).toHaveValue("activity-gym");

    await goal.chooseActivity("No associated activity");
    await goal.save();

    await goal.goBack();
    await expect(
      setup.goalDetail("3 days per week · No associated activity"),
    ).toBeVisible();
  });

  test("should change the icon of a goal", async ({ page }) => {
    const setup = new SetupPageObject(page);
    const goal = new GoalPageObject(page);
    const picker = new IconPickerPageObject(page);
    await setup.goto();
    await goal.openFromSetup("Read");
    await goal.iconButton.click();
    await expect(picker.kind("Goal icon")).toBeVisible();
    await expect(picker.subject("For Read")).toBeVisible();
    await expect(picker.chosenIcon("menu book")).toBeVisible();

    await picker.choose("pool");
    await expect(goal.unsavedNote).toBeVisible();
    await goal.save();

    await goal.iconButton.click();
    await expect(picker.chosenIcon("pool")).toBeVisible();
  });

  test("should archive a goal, hide it on the log, and restore it in setup", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    const goal = new GoalPageObject(page);
    const log = new LogPageObject(page);
    await setup.goto();
    await goal.openFromSetup("Read");

    await goal.archive();

    await expect(
      setup.notice("Archived “Read”. You can restore it in Setup."),
    ).toBeVisible();
    await expect(setup.goalsHeading("1 active · 2 total")).toBeVisible();
    await expect(setup.restoreButton("Read")).toBeVisible();
    await log.open();
    await expect(log.openGoalSwitch("Read")).toBeHidden();
    await expect(log.goalCount).toHaveText("0/1");

    await setup.open();
    await setup.restoreButton("Read").click();

    await expect(setup.notice("Restored.")).toBeVisible();
    await expect(setup.goalsHeading("2 active · 2 total")).toBeVisible();
    await log.open();
    await expect(log.openGoalSwitch("Read")).toBeVisible();
  });

  test("should delete a goal after a warning", async ({ page }) => {
    const setup = new SetupPageObject(page);
    const goal = new GoalPageObject(page);
    const log = new LogPageObject(page);
    await setup.goto();
    await goal.openFromSetup("Read");

    const warning = await goal.delete();

    expect(warning).toBe(
      "Delete the goal “Read”?\n\nThis also deletes all of its completion history. You cannot recover a deleted goal. To hide the goal and keep its history, archive it instead.",
    );
    await expect(setup.notice("Deleted “Read”.")).toBeVisible();
    await expect(setup.goalsHeading("1 active · 1 total")).toBeVisible();
    await expect(setup.configureButton("Read")).toBeHidden();
    await log.open();
    await expect(log.goalOpenButton("Read")).toBeHidden();
  });

  test("should keep a goal when the owner does not agree to the delete", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    const goal = new GoalPageObject(page);
    await setup.goto();
    await goal.openFromSetup("Read");

    await goal.declineDelete();

    await expect(goal.heading("Read")).toBeVisible();
    await goal.goBack();
    await expect(setup.goalsHeading("2 active · 2 total")).toBeVisible();
  });

  test("should open a goal from the log and come back to the log", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    const goal = new GoalPageObject(page);
    await log.goto();

    await goal.openFromLog("Move your body");
    await expect(
      goal.explainer("Each week needs 3 completed days."),
    ).toBeVisible();
    await goal.goBack();

    await expect(log.heading).toBeVisible();
  });

  test("should move a goal down and up", async ({ page }) => {
    const setup = new SetupPageObject(page);
    const log = new LogPageObject(page);
    await setup.goto();
    await expect(setup.moveUpButton("Move your body")).toBeDisabled();
    await expect(setup.moveDownButton("Read")).toBeDisabled();

    await setup.moveDownButton("Move your body").click();
    await expect(setup.notice("Setup updated.")).toBeVisible();

    await expect(setup.moveUpButton("Read")).toBeDisabled();
    await expect(setup.main).toMatchAriaSnapshot(`
      - button "Configure Read"
      - button "Configure Move your body"
    `);
    await log.open();
    await expect(log.form).toMatchAriaSnapshot(`
      - button "Mark Read completed"
      - button "Mark Move your body completed"
    `);
  });
});
