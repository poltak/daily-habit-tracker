import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";
import { LogPageObject } from "../black-box-tests/log-page-object.js";

/** Two days a month back: the log opens them through the calendar, one month at a time. */
function backup(first: string, second: string) {
  return {
    sourceSystem: "daylio",
    sourceSha256: "black-box-days",
    moods: [
      { sourceId: "1", name: "rad", score: 5 },
      { sourceId: "2", name: "good", score: 4 },
    ],
    groups: [{ sourceId: "1", name: "Imported group", sortOrder: 9 }],
    activities: [
      {
        sourceId: "1",
        groupSourceId: "1",
        name: "Imported book",
        sortOrder: 0,
      },
    ],
    goals: [],
    entries: [
      {
        sourceId: "1",
        logicalDate: first,
        localTime: "20:00",
        moodSourceId: "2",
        activitySourceIds: ["1"],
      },
      {
        sourceId: "2",
        logicalDate: second,
        localTime: "20:00",
        moodSourceId: "1",
        activitySourceIds: [],
      },
    ],
    completions: [],
  };
}

test.describe("days from an imported backup", () => {
  test("should show each imported day with its mood and activities", async ({
    ownerRequest,
    ownerPage,
    apiOrigin,
  }) => {
    const log = new LogPageObject(ownerPage);
    await log.goto();
    const today = await log.currentDate();
    const first = LogPageObject.addDays(today, -35);
    const second = LogPageObject.addDays(today, -34);
    const response = await ownerRequest.post(`${apiOrigin}/api/import`, {
      data: backup(first, second),
    });
    expect(response.status()).toBe(200);

    await log.goto();
    await log.goToDay(first);

    await expect(log.chosenMood("Good")).toBeVisible();
    await expect(log.selectedActivity("Imported book")).toBeVisible();
    await expect(log.savedButton).toBeVisible();
    await log.goToDay(second);
    await expect(log.chosenMood("Rad")).toBeVisible();
    await expect(log.selectedActivitiesEmpty).toBeVisible();
  });
});
