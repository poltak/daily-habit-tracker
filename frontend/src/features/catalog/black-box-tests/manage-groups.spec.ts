import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { LogPageObject } from "../../days/black-box-tests/log-page-object.js";
import { SetupPageObject } from "../../settings/black-box-tests/setup-page-object.js";

test.describe("manage activity groups", () => {
  test("should add a group, empty, and show it on the log", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    const log = new LogPageObject(page);
    await setup.goto();

    await setup.addGroup("Travel");

    await expect(setup.notice("Setup updated.")).toBeVisible();
    await expect(setup.group("Travel")).toBeVisible();
    await expect(
      setup.activitiesHeading("12 active activities in 6 groups"),
    ).toBeVisible();
    await expect(setup.newGroupField).toHaveValue("");
    await expect(setup.groupCount("Travel", "0 active")).toBeVisible();
    await setup.openGroup("Travel", setup.emptyGroup("Travel"));
    await expect(setup.emptyGroup("Travel")).toBeVisible();
    await log.open();
    await expect(log.group("Travel")).toBeHidden();
    await expect(log.group("Health")).toBeVisible();
  });

  test("should refuse a group with no name", async ({ page }) => {
    const setup = new SetupPageObject(page);
    await setup.goto();

    await setup.addGroup("  ");

    await expect(setup.notice("Group name is required.")).toBeVisible();
    await expect(
      setup.activitiesHeading("12 active activities in 5 groups"),
    ).toBeVisible();
  });

  test("should rename a group on every page", async ({ page }) => {
    const setup = new SetupPageObject(page);
    const log = new LogPageObject(page);
    await setup.goto();

    await setup.rename("Leisure", "Free time");

    await expect(setup.notice("Setup updated.")).toBeVisible();
    await expect(setup.group("Free time")).toBeVisible();
    await expect(setup.group("Leisure")).toBeHidden();
    await log.open();
    await expect(log.groupSummary("Free time", 3)).toBeVisible();
    await expect(log.addActivityButton("Leisure")).toBeHidden();
  });

  test("should archive a group with its activities, and restore it", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    const log = new LogPageObject(page);
    await setup.goto();

    await setup.archiveButton("Work").click();

    await expect(setup.notice("Archived.")).toBeVisible();
    await expect(setup.restoreButton("Work")).toBeVisible();
    await expect(
      setup.groupCount("Work", "2 active · group archived"),
    ).toBeVisible();
    await expect(
      setup.activitiesHeading("12 active activities in 4 groups"),
    ).toBeVisible();
    await log.open();
    await expect(log.group("Work")).toBeHidden();
    await expect(log.group("Health")).toBeVisible();

    await setup.open();
    await setup.restoreButton("Work").click();

    await expect(setup.notice("Restored.")).toBeVisible();
    await expect(
      setup.activitiesHeading("12 active activities in 5 groups"),
    ).toBeVisible();
    await log.open();
    await expect(log.groupSummary("Work", 2)).toBeVisible();
  });

  test("should delete a group with its activities after a warning that counts them", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    const log = new LogPageObject(page);
    await setup.goto();

    const warning = await setup.delete("Home");

    expect(warning).toBe(
      "Delete the activity group “Home”?\n\nThis also deletes its 2 activities and removes them from each day on which they are recorded. A goal linked to a deleted activity stays, without an associated activity. You cannot recover a deleted group or its activities. To hide the group and keep its history, archive it instead.",
    );
    await expect(setup.notice("Deleted.")).toBeVisible();
    await expect(setup.group("Home")).toBeHidden();
    await expect(
      setup.activitiesHeading("10 active activities in 4 groups"),
    ).toBeVisible();
    await log.open();
    await expect(log.group("Home")).toBeHidden();
  });

  test("should delete an empty group with a short warning", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    await setup.goto();
    await setup.addGroup("Travel");
    await setup.group("Travel").waitFor();

    const warning = await setup.delete("Travel");

    expect(warning).toBe(
      "Delete the activity group “Travel”?\n\nYou cannot recover a deleted group.",
    );
    await expect(setup.group("Travel")).toBeHidden();
  });

  test("should keep a group when the owner does not agree to the delete", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    await setup.goto();

    await setup.declineDelete("People");

    await expect(setup.group("People")).toBeVisible();
    await expect(
      setup.activitiesHeading("12 active activities in 5 groups"),
    ).toBeVisible();
  });

  test("should not add an activity to an archived group", async ({ page }) => {
    const setup = new SetupPageObject(page);
    await setup.goto();
    await setup.archiveButton("Work").click();
    await setup.restoreButton("Work").waitFor();

    await expect(setup.addActivityButton("Work")).toBeHidden();
    await expect(setup.addActivityButton("Health")).toBeHidden();
  });
});
