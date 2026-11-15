import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

test.describe("insights route", () => {
  test("should answer the catalog and the saved days, and let no cache keep them", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const today = new Date().toISOString().slice(0, 10);
    await ownerRequest.put(`${apiOrigin}/api/entries/${today}`, {
      data: {
        moodId: "mood-good",
        activityIds: ["activity-gym"],
        completedGoalIds: [],
      },
    });

    const response = await ownerRequest.get(`${apiOrigin}/api/insights`);

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    const body = await response.json();
    expect(Object.keys(body).toSorted()).toEqual([
      "activities",
      "days",
      "groups",
      "moods",
    ]);
    expect(body.moods).toHaveLength(5);
    expect(body.groups).toHaveLength(5);
    expect(body.activities).toHaveLength(12);
    expect(body.days).toEqual([
      {
        logicalDate: today,
        moodId: "mood-good",
        activityIds: ["activity-gym"],
      },
    ]);
  });
});
