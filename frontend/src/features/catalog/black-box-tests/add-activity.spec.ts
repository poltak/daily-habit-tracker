import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { LogPageObject } from "../../days/black-box-tests/log-page-object.js";
import { SetupPageObject } from "../../settings/black-box-tests/setup-page-object.js";
import { AddActivityPageObject } from "./add-activity-page-object.js";

test.describe("add an activity", () => {
  test("should add an activity to a group from the log, and use it on the day", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    const form = new AddActivityPageObject(page);
    await log.goto();
    await log.startAddActivity("Health");
    await expect(form.heading).toBeVisible();
    await expect(form.groupField).toHaveValue("group-health");
    await expect(form.backButton("Log")).toBeVisible();

    await form.add({ name: "Yoga" });

    await expect(log.notice("Activity added.")).toBeVisible();
    await expect(log.groupSummary("Health", 4)).toBeVisible();
    await log.toggleActivity({ group: "Health", name: "Yoga" });
    await expect(log.selectedActivity("Yoga")).toBeVisible();
    await log.goto();
    await expect(log.groupSummary("Health", 4)).toBeVisible();
  });

  test("should add an activity to another group that the owner picks", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    const form = new AddActivityPageObject(page);
    await log.goto();
    await log.startAddActivity("Health");
    await form.heading.waitFor();

    await form.add({ name: "Painting", group: "Leisure" });

    await expect(log.groupSummary("Leisure", 4)).toBeVisible();
    await expect(log.groupSummary("Health", 3)).toBeVisible();
    await log.openGroup({ group: "Leisure", name: "Painting" });
    await expect(
      log.activity({ group: "Leisure", name: "Painting" }),
    ).toBeVisible();
  });

  test("should refuse a name that has only spaces", async ({ page }) => {
    const log = new LogPageObject(page);
    const form = new AddActivityPageObject(page);
    await log.goto();
    await log.startAddActivity("Work");
    await form.heading.waitFor();

    await form.tryAdd("   ");

    await expect(form.notice("Activity name is required.")).toBeVisible();
    await expect(form.heading).toBeVisible();
    await form.add({ name: "Planning" });
    await expect(log.groupSummary("Work", 3)).toBeVisible();
  });

  test("should go back to the log without an activity when the owner cancels", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    const form = new AddActivityPageObject(page);
    await log.goto();
    await log.startAddActivity("Home");
    await form.fillName("Gardening");

    await form.cancel();

    await expect(log.heading).toBeVisible();
    await expect(log.groupSummary("Home", 2)).toBeVisible();
  });

  test("should add an activity from the setup page, and return to it", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    const form = new AddActivityPageObject(page);
    await setup.goto();
    await expect(
      setup.activitiesHeading("12 active activities in 5 groups"),
    ).toBeVisible();
    await setup.startAddActivity("People");
    await expect(form.backButton("Setup")).toBeVisible();
    await expect(form.groupField).toHaveValue("group-people");

    await form.add({ name: "Neighbours" });

    await expect(setup.heading).toBeVisible();
    await expect(setup.notice("Activity added.")).toBeVisible();
    await expect(
      setup.activitiesHeading("13 active activities in 5 groups"),
    ).toBeVisible();
    await setup.openGroup("People", setup.renameButton("Family"));
    await expect(setup.renameButton("Neighbours")).toBeVisible();
  });

  test("should go back with the back button", async ({ page }) => {
    const log = new LogPageObject(page);
    const form = new AddActivityPageObject(page);
    await log.goto();
    await log.startAddActivity("Health");
    await form.heading.waitFor();

    await form.backButton("Log").click();

    await expect(form.heading).toBeHidden();
    await expect(log.heading).toBeVisible();
  });
});
