import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { LogPageObject } from "./log-page-object.js";

const WALK = { group: "Health", name: "Walk" };
const SLEEP = { group: "Health", name: "Sleep" };
const COOK = { group: "Home", name: "Cook" };

test.describe("change a saved day", () => {
  test("should keep a new mood of a saved day after a reload", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    await log.goto();
    await log.logDay({ mood: "Good", activities: [WALK] });

    await log.chooseMood("Awful");
    await log.goto();

    await expect(log.chosenMood("Awful")).toBeVisible();
    await expect(log.chosenMood("Good")).toBeHidden();
    await expect(log.saveTitle).toHaveText("Your entry is saved");
    await expect(log.selectedActivity("Walk")).toBeVisible();
  });

  test("should keep an added and a removed activity of a saved day", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    await log.goto();
    const today = await log.currentDate();
    await log.logDay({ mood: "Rad", activities: [WALK, SLEEP] });

    await log.toggleActivity(COOK);
    await log.selectedActivity("Cook").waitFor();
    await log.toggleActivity(WALK);
    await log.selectedActivity("Walk").waitFor({ state: "hidden" });
    await expect(log.selectedCount("2 selected")).toBeVisible();
    await expect(
      log.saveDetail(`${LogPageObject.friendlyDate(today)} · 2 activities`),
    ).toBeVisible();

    await log.goto();

    await expect(log.selectedActivity("Cook")).toBeVisible();
    await expect(log.selectedActivity("Sleep")).toBeVisible();
    await expect(log.selectedActivity("Walk")).toBeHidden();
    await expect(log.saveTitle).toHaveText("Your entry is saved");
  });

  test("should remove an activity with its chip", async ({ page }) => {
    const log = new LogPageObject(page);
    await log.goto();
    await log.logDay({ mood: "Meh", activities: [WALK] });

    await log.selectedActivity("Walk").click();

    await expect(log.selectedActivitiesEmpty).toBeVisible();
    await expect(log.selectedCount("0 selected")).toBeVisible();
    await log.openGroup(WALK);
    await expect(log.chosenActivity(WALK)).toBeHidden();
    await expect(log.activity(WALK)).toBeVisible();
  });

  test("should save a day again after the owner deletes it", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    await log.goto();
    await log.logDay({ mood: "Rad" });
    await log.deleteEntry();

    await log.logDay({ mood: "Bad" });

    await log.goto();
    await expect(log.chosenMood("Bad")).toBeVisible();
    await expect(log.saveTitle).toHaveText("Your entry is saved");
  });
});
