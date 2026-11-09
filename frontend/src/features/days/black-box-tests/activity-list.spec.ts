import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { LogPageObject } from "./log-page-object.js";

const GYM = { group: "Health", name: "Gym" };
const READING = { group: "Leisure", name: "Reading" };

test.describe("the list of activities", () => {
  test("should list the groups with the number of activities in each", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    await log.goto();

    await expect(log.groupSummary("Health", 3)).toBeVisible();
    await expect(log.groupSummary("Work", 2)).toBeVisible();
    await expect(log.groupSummary("Home", 2)).toBeVisible();
    await expect(log.groupSummary("People", 2)).toBeVisible();
    await expect(log.groupSummary("Leisure", 3)).toBeVisible();
    await expect(log.activity(GYM)).toBeHidden();
    await expect(log.selectedActivitiesEmpty).toBeVisible();
    await expect(log.selectedCount("0 selected")).toBeVisible();
  });

  test("should show the activities of a group when the owner opens it", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    await log.goto();

    await log.openGroup(READING);

    await expect(log.activity(READING)).toBeVisible();
    await expect(
      log.activity({ group: "Leisure", name: "Gaming" }),
    ).toBeVisible();
    await expect(
      log.activity({ group: "Leisure", name: "Music" }),
    ).toBeVisible();
    await expect(log.activity(GYM)).toBeHidden();
  });

  test("should open the groups that have a match for a search", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    await log.goto();

    await log.searchActivities("ga");

    await expect(
      log.activity({ group: "Leisure", name: "Gaming" }),
    ).toBeVisible();
    await expect(log.activity(READING)).toBeHidden();
    await expect(log.group("Health")).toBeHidden();
    await log.activity({ group: "Leisure", name: "Gaming" }).click();
    await expect(log.selectedActivity("Gaming")).toBeVisible();
  });

  test("should say so when no activity matches the search, and list all again when the search is empty", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    await log.goto();

    await log.searchActivities("zzz");
    await expect(log.noSearchMatches).toBeVisible();
    await expect(log.group("Health")).toBeHidden();

    await log.searchActivities("");
    await expect(log.noSearchMatches).toBeHidden();
    await expect(log.groupSummary("Health", 3)).toBeVisible();
    await expect(log.groupSummary("Leisure", 3)).toBeVisible();
  });

  test("should find an activity with a search in capital letters", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    await log.goto();

    await log.searchActivities("DEEP");

    await expect(
      log.activity({ group: "Work", name: "Deep work" }),
    ).toBeVisible();
  });
});
