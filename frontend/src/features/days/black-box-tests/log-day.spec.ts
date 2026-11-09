import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { LogPageObject } from "./log-page-object.js";

const GYM = { group: "Health", name: "Gym" };
const WALK = { group: "Health", name: "Walk" };
const MUSIC = { group: "Leisure", name: "Music" };

test.describe("log a day", () => {
  test("should save the mood, the activities, and the goals of today", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    await log.goto();
    const today = await log.currentDate();
    await expect(log.heading).toHaveText("How was your day?");
    await expect(log.saveTitle).toHaveText("Ready to save your day?");
    await expect(
      log.saveDetail(`${LogPageObject.friendlyDate(today)} · 0 activities`),
    ).toBeVisible();

    await log.chooseMood("Good");
    await log.toggleActivity(WALK);
    await log.toggleActivity(MUSIC);
    await expect(log.selectedCount("2 selected")).toBeVisible();
    await expect(log.selectedActivity("Walk")).toBeVisible();
    await expect(log.selectedActivity("Music")).toBeVisible();
    await log.save();

    await expect(
      log.notice(`Saved ${LogPageObject.shortDate(today)}.`),
    ).toBeVisible();
    await expect(log.saveTitle).toHaveText("Your entry is saved");
    await expect(log.savedButton).toBeDisabled();
    await expect(log.deleteButton).toBeVisible();
    await expect(
      log.saveDetail(`${LogPageObject.friendlyDate(today)} · 2 activities`),
    ).toBeVisible();
  });

  test("should keep a saved day after a reload", async ({ page }) => {
    const log = new LogPageObject(page);
    await log.goto();
    await log.logDay({ mood: "Meh", activities: [WALK, MUSIC] });

    await log.goto();

    await expect(log.chosenMood("Meh")).toBeVisible();
    await expect(log.chosenMood("Good")).toBeHidden();
    await expect(log.selectedActivity("Walk")).toBeVisible();
    await expect(log.selectedActivity("Music")).toBeVisible();
    await expect(log.savedButton).toBeVisible();
    await expect(log.saveTitle).toHaveText("Your entry is saved");
  });

  test("should refuse to save a day with no mood", async ({ page }) => {
    const log = new LogPageObject(page);
    await log.goto();
    await log.toggleActivity(WALK);
    await log.selectedActivity("Walk").waitFor();

    await log.saveButton.click();

    await expect(
      log.notice("Pick the mood that best sums up the day."),
    ).toBeVisible();
    await expect(log.saveTitle).toHaveText("Ready to save your day?");
    await expect(log.saveButton).toBeEnabled();
    await log.chooseMood("Rad");
    await log.save();
    await expect(log.saveTitle).toHaveText("Your entry is saved");
  });

  test("should keep a choice at once, also before the day is saved", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    await log.goto();
    await log.chooseMood("Bad");
    await log.toggleActivity(GYM);
    await log.selectedActivity("Gym").waitFor();

    await log.goto();

    await expect(log.chosenMood("Bad")).toBeVisible();
    await expect(log.selectedActivity("Gym")).toBeVisible();
    await expect(log.doneGoalSwitch("Move your body")).toBeVisible();
    await expect(log.saveTitle).toHaveText("Ready to save your day?");
    await expect(log.saveButton).toBeEnabled();
  });

  test("should delete a saved day after the owner agrees", async ({ page }) => {
    const log = new LogPageObject(page);
    await log.goto();
    const today = await log.currentDate();
    await log.logDay({ mood: "Rad", activities: [MUSIC] });

    await log.deleteEntry();

    await expect(log.notice("Entry deleted.")).toBeVisible();
    await expect(log.saveTitle).toHaveText("Ready to save your day?");
    await expect(log.chosenMood("Rad")).toBeHidden();
    await log.goto();
    await expect(log.chosenMood("Rad")).toBeHidden();
    await expect(log.selectedActivitiesEmpty).toBeVisible();
    await expect(
      log.saveDetail(`${LogPageObject.friendlyDate(today)} · 0 activities`),
    ).toBeVisible();
  });

  test("should keep the day when the owner does not agree to the delete", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    await log.goto();
    const today = await log.currentDate();
    await log.logDay({ mood: "Rad" });

    const question = await log.declineDeleteEntry();

    expect(question).toBe(
      `Delete the entry for ${LogPageObject.friendlyDate(today)}?`,
    );
    await expect(log.saveTitle).toHaveText("Your entry is saved");
    await expect(log.chosenMood("Rad")).toBeVisible();
  });
});
