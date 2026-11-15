import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { LogPageObject } from "../../days/black-box-tests/log-page-object.js";
import { SetupPageObject } from "../../settings/black-box-tests/setup-page-object.js";

test.describe("manage activities", () => {
  test("should rename an activity everywhere", async ({ page }) => {
    const setup = new SetupPageObject(page);
    const log = new LogPageObject(page);
    await setup.goto();
    await setup.openGroup("Health", setup.renameButton("Gym"));

    const question = await setup.rename("Gym", "Lifting");

    expect(question).toBe("New name");
    await expect(setup.notice("Setup updated.")).toBeVisible();
    await expect(setup.renameButton("Lifting")).toBeVisible();
    await expect(setup.renameButton("Gym")).toBeHidden();
    await expect(setup.goalDetail("3 days per week · Lifting")).toBeVisible();
    await log.open();
    await log.openGroup({ group: "Health", name: "Lifting" });
    await expect(
      log.activity({ group: "Health", name: "Lifting" }),
    ).toBeVisible();
    await expect(log.activity({ group: "Health", name: "Gym" })).toBeHidden();
    await expect(
      log.goalDescription("3 days this week · Lifting"),
    ).toBeVisible();
  });

  test("should keep the name when the owner cancels or types spaces", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    await setup.goto();
    await setup.openGroup("Health", setup.renameButton("Gym"));

    await setup.declineRename("Gym");
    await setup.rename("Gym", "   ");

    await expect(setup.renameButton("Gym")).toBeVisible();
    await expect(setup.notice("Setup updated.")).toBeHidden();
  });

  test("should move an activity to another group", async ({ page }) => {
    const setup = new SetupPageObject(page);
    const log = new LogPageObject(page);
    await setup.goto();
    await setup.openGroup("Health", setup.groupFieldOf("Walk"));

    await setup.groupFieldOf("Walk").selectOption({ label: "Work" });

    await expect(setup.notice("Setup updated.")).toBeVisible();
    await expect(setup.groupCount("Health", "2 active")).toBeVisible();
    await expect(setup.groupCount("Work", "3 active")).toBeVisible();
    await log.open();
    await expect(log.groupSummary("Health", 2)).toBeVisible();
    await expect(log.groupSummary("Work", 3)).toBeVisible();
    await log.openGroup({ group: "Work", name: "Walk" });
    await expect(log.activity({ group: "Work", name: "Walk" })).toBeVisible();
  });

  test("should archive an activity, hide it on the log, and restore it", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    const log = new LogPageObject(page);
    await setup.goto();
    await setup.openGroup("Health", setup.archiveButton("Walk"));

    await setup.archiveButton("Walk").click();

    await expect(setup.notice("Archived.")).toBeVisible();
    await expect(setup.restoreButton("Walk")).toBeVisible();
    await expect(setup.archiveButton("Walk")).toBeHidden();
    await expect(
      setup.activitiesHeading("11 active activities in 5 groups"),
    ).toBeVisible();
    await expect(
      setup.groupCount("Health", "2 active · 1 archived"),
    ).toBeVisible();
    await log.open();
    await expect(log.groupSummary("Health", 2)).toBeVisible();

    await setup.open();
    await setup.openGroup("Health", setup.restoreButton("Walk"));
    await setup.restoreButton("Walk").click();

    await expect(setup.notice("Restored.")).toBeVisible();
    await expect(setup.archiveButton("Walk")).toBeVisible();
    await expect(
      setup.activitiesHeading("12 active activities in 5 groups"),
    ).toBeVisible();
    await log.open();
    await expect(log.groupSummary("Health", 3)).toBeVisible();
  });

  test("should delete an activity after a warning, and remove it from the days and the goals", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    const log = new LogPageObject(page);
    await log.goto();
    await log.logDay({
      mood: "Good",
      activities: [
        { group: "Health", name: "Gym" },
        { group: "Health", name: "Walk" },
      ],
    });
    await setup.open();
    await setup.openGroup("Health", setup.deleteButton("Gym"));

    const warning = await setup.delete("Gym");

    expect(warning).toBe(
      "Delete the activity “Gym”?\n\nThis also removes it from each day on which it is recorded. A goal linked to it stays, without an associated activity. You cannot recover a deleted activity. To hide the activity and keep its history, archive it instead.",
    );
    await expect(setup.notice("Deleted.")).toBeVisible();
    await expect(setup.renameButton("Gym")).toBeHidden();
    await expect(
      setup.activitiesHeading("11 active activities in 5 groups"),
    ).toBeVisible();
    await expect(
      setup.goalDetail("3 days per week · No associated activity"),
    ).toBeVisible();
    await log.open();
    await expect(log.groupSummary("Health", 2)).toBeVisible();
    await expect(log.selectedActivity("Walk")).toBeVisible();
    await expect(log.selectedActivity("Gym")).toBeHidden();
    await expect(log.selectedCount("1 selected")).toBeVisible();
  });

  test("should keep an activity when the owner does not agree to the delete", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    await setup.goto();
    await setup.openGroup("Home", setup.deleteButton("Cook"));

    const warning = await setup.declineDelete("Cook");

    expect(warning).toContain("Delete the activity “Cook”?");
    await expect(setup.renameButton("Cook")).toBeVisible();
    await expect(
      setup.activitiesHeading("12 active activities in 5 groups"),
    ).toBeVisible();
  });

  test("should show only the activities that match a filter, in open groups", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    await setup.goto();

    await setup.filterActivities("walk");

    await expect(setup.renameButton("Walk")).toBeVisible();
    await expect(setup.renameButton("Gym")).toBeHidden();
    await expect(setup.group("Work")).toBeHidden();
    await setup.filterActivities("zzz");
    await expect(setup.noFilterMatches).toBeVisible();
    await setup.filterActivities("");
    await expect(setup.noFilterMatches).toBeHidden();
    await expect(setup.group("Work")).toBeVisible();
  });
});
