import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { LogPageObject } from "../../days/black-box-tests/log-page-object.js";
import { GoalPageObject } from "../../goals/black-box-tests/goal-page-object.js";
import { InsightsPageObject } from "./insights-page-object.js";

const GYM = { group: "Health", name: "Gym" };
const COOK = { group: "Home", name: "Cook" };

test.describe("best weeks", () => {
  test("should compare the weeks with a higher mood with the typical weeks", async ({
    page,
  }) => {
    test.slow();
    const log = new LogPageObject(page);
    const insights = new InsightsPageObject(page);
    await log.goto();
    const lastWeek = LogPageObject.addDays(
      GoalPageObject.weekStart(await log.currentDate()),
      -7,
    );
    const weekBefore = LogPageObject.addDays(lastWeek, -7);
    // A week needs four logged days, so two weeks of four days are the least
    // that gives a higher cohort and a typical one.
    for (const [weekStart, mood, activity] of [
      [weekBefore, "Rad", GYM],
      [lastWeek, "Meh", COOK],
    ] as const) {
      for (const offset of [0, 1, 2, 3]) {
        await log.goToDay(LogPageObject.addDays(weekStart, offset));
        await log.logDay({ mood, activities: [activity] });
      }
    }

    await insights.open();

    await expect(
      insights.sectionHeading("What higher-mood weeks have in common"),
    ).toBeVisible();
    await expect(insights.cohortMetric("Higher-mood weeks")).toContainText(
      "1Mean mood 5.00",
    );
    await expect(insights.cohortMetric("Typical / rest weeks")).toContainText(
      "1Mean mood 3.00",
    );
    await expect(insights.cohortMetric("Activity spread")).toContainText(
      "1.0 activities / logged dayHigher cohort · typical 1.0 activities / logged day",
    );
    await expect(insights.cohortActivityRow("Gym")).toHaveAccessibleName(
      "Gym 100% 0% +100 pp",
    );
    await expect(insights.cohortActivityRow("Cook")).toHaveAccessibleName(
      "Cook 0% 100% -100 pp",
    );
    await expect(insights.cohortActivityRow("Walk")).toHaveAccessibleName(
      "Walk 0% 0% +0 pp",
    );
    await expect(insights.qualifyingWeek(weekBefore)).toContainText(
      "5.00 (n=4)4Higher moodGym (4)",
    );
    await expect(insights.qualifyingWeek(lastWeek)).toContainText(
      "3.00 (n=4)4Typical / restCook (4)",
    );
    await expect(insights.qualifyingWeeksCount("2 weeks")).toBeVisible();
  });

  test("should say that no week is long enough when the days are few", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    const insights = new InsightsPageObject(page);
    await log.goto();
    await log.logDay({ mood: "Good", activities: [GYM] });

    await insights.open();

    await expect(insights.noQualifyingWeeks).toBeVisible();
    await expect(insights.cohortMetric("Higher-mood weeks")).toBeHidden();
  });
});
