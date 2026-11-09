import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { GoalPageObject } from "../../goals/black-box-tests/goal-page-object.js";
import { LogPageObject } from "../../days/black-box-tests/log-page-object.js";
import { SetupPageObject } from "./setup-page-object.js";

test.describe("week", () => {
  test("should run Monday to Sunday by default", async ({ page }) => {
    const setup = new SetupPageObject(page);
    await setup.goto();

    await expect(setup.weekEndsField).toHaveValue("0");
    await expect(setup.weekDescription("Monday–Sunday")).toBeVisible();
  });

  test("should change the day on which the week ends, on every device", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    await setup.goto();

    await setup.chooseWeekEnd("Saturday");

    await expect(setup.notice("Weeks now run Sunday–Saturday.")).toBeVisible();
    await expect(setup.weekDescription("Sunday–Saturday")).toBeVisible();
    await setup.goto();
    await expect(setup.weekEndsField).toHaveValue("6");
    await expect(setup.weekDescription("Sunday–Saturday")).toBeVisible();
  });

  test("should change the weeks in the history of a goal", async ({ page }) => {
    const setup = new SetupPageObject(page);
    const log = new LogPageObject(page);
    const goal = new GoalPageObject(page);
    await log.goto();
    const today = await log.currentDate();
    const sundayStart = LogPageObject.addDays(
      today,
      -new Date(`${today}T12:00:00Z`).getUTCDay(),
    );
    const mondayStart = GoalPageObject.weekStart(today);
    await setup.open();
    await setup.chooseWeekEnd("Saturday");
    await setup.notice("Weeks now run Sunday–Saturday.").waitFor();

    await goal.openFromSetup("Move your body");

    await expect(
      goal.week(
        `${LogPageObject.shortDate(sundayStart)} – ${LogPageObject.shortDate(LogPageObject.addDays(sundayStart, 6))}`,
      ),
    ).toBeVisible();
    await expect(
      goal.week(
        `${LogPageObject.shortDate(mondayStart)} – ${LogPageObject.shortDate(LogPageObject.addDays(mondayStart, 6))}`,
      ),
    ).toBeHidden();
  });
});

test.describe("export", () => {
  test("should download the journal as a JSON file", async ({ page }) => {
    const setup = new SetupPageObject(page);
    await setup.goto();

    const download = await setup.exportData();

    expect(download.suggestedFilename()).toBe("daylio-clone-export.json");
    await expect(setup.notice("Export downloaded.")).toBeVisible();
    await expect(setup.exportButton).toBeEnabled();
  });
});
