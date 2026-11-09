import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { LogPageObject } from "../../days/black-box-tests/log-page-object.js";
import { InsightsPageObject } from "./insights-page-object.js";

const GYM = { group: "Health", name: "Gym" };
const COOK = { group: "Home", name: "Cook" };
const MUSIC = { group: "Leisure", name: "Music" };

/** Five days up to today: Gym on the good days, Cook on the bad ones. Returns today. */
async function recordFiveDays(page: Page): Promise<string> {
  const log = new LogPageObject(page);
  await log.goto();
  const today = await log.currentDate();
  const days = [
    { back: 0, mood: "Rad", activities: [GYM] },
    { back: 1, mood: "Good", activities: [GYM] },
    { back: 2, mood: "Meh", activities: [COOK] },
    { back: 3, mood: "Good", activities: [GYM, MUSIC] },
    { back: 4, mood: "Bad", activities: [COOK] },
  ];
  for (const day of days) {
    await log.goToDay(LogPageObject.addDays(today, -day.back));
    await log.logDay({ mood: day.mood, activities: day.activities });
  }
  return today;
}

test.describe("insights", () => {
  test("should invite the owner to record a day when the journal is empty", async ({
    page,
  }) => {
    const insights = new InsightsPageObject(page);
    await insights.goto();

    await expect(insights.emptyHistory).toBeVisible();
    await expect(insights.summary).toMatchAriaSnapshot(`
      - group "Selected period summary":
        - strong: "0"
        - text: recorded days
    `);
    await expect(insights.sectionLink("Activities")).toBeHidden();
  });

  test("should summarize the recorded days", async ({ page }) => {
    test.slow();
    const insights = new InsightsPageObject(page);
    await recordFiveDays(page);

    await insights.open();

    await expect(insights.summary).toMatchAriaSnapshot(`
      - group "Selected period summary":
        - strong: "5"
        - text: recorded days
        - strong: 100%
        - text: of days recorded
        - strong: "3"
        - text: activities recorded
    `);
    await expect(insights.emptyHistory).toBeHidden();
  });

  test("should rank the activities by the mood on the days that have them", async ({
    page,
  }) => {
    test.slow();
    const insights = new InsightsPageObject(page);
    await recordFiveDays(page);

    await insights.open();

    await expect(
      insights.sectionHeading("Which activities show up with better moods?"),
    ).toBeVisible();
    await expect(insights.rankedActivity("Gym")).toContainText(
      "3 recorded · 2 not recorded",
    );
    await expect(insights.rankedActivity("Gym")).toContainText(
      "+1.83 mood points",
    );
    await expect(insights.rankedActivity("Music")).toContainText(
      "1 recorded · 4 not recorded",
    );
    await expect(insights.rankedActivity("Music")).toContainText(
      "+0.50 mood points",
    );
    await expect(insights.rankedActivity("Cook")).toContainText(
      "-1.83 mood points",
    );
    await expect(insights.rankedActivity("Sleep")).toContainText(
      "0 recorded · 5 not recorded",
    );
    await expect(insights.rankedActivity("Sleep")).toContainText(
      "No comparison",
    );
    await expect(insights.pickedActivity("Gym")).toBeVisible();
    await expect(insights.pickedActivity("Music")).toBeHidden();
  });

  test("should show the detail of an activity that the owner picks", async ({
    page,
  }) => {
    test.slow();
    const insights = new InsightsPageObject(page);
    await recordFiveDays(page);
    await insights.open();
    await expect(insights.activityDetail("Gym")).toBeVisible();
    await expect(insights.moodGap).toHaveText("+1.83 mood points");

    await insights.chooseActivity("Cook");

    await expect(insights.activityDetail("Cook")).toBeVisible();
    await expect(insights.moodGap).toHaveText("-1.83 mood points");
    await expect(insights.pickedActivity("Cook")).toBeVisible();
    await expect(insights.pickedActivity("Gym")).toBeHidden();
  });

  test("should list the sections of the analysis", async ({ page }) => {
    test.slow();
    const insights = new InsightsPageObject(page);
    await recordFiveDays(page);

    await insights.open();

    for (const name of [
      "Activities",
      "Next day",
      "Combinations",
      "Rhythms",
      "Best weeks",
    ]) {
      await expect(insights.sectionLink(name)).toBeVisible();
    }
    await expect(
      insights.sectionHeading("What happens around an activity day?"),
    ).toBeVisible();
    await expect(
      insights.sectionHeading("Which pairs have a useful mood split?"),
    ).toBeVisible();
    await expect(
      insights.sectionHeading("Weekly and seasonal rhythms"),
    ).toBeVisible();
    await expect(insights.weekdayTable).toBeVisible();
  });

  test("should show the mean mood of each weekday in the period", async ({
    page,
  }) => {
    test.slow();
    const insights = new InsightsPageObject(page);
    const today = await recordFiveDays(page);
    await insights.open();

    // Rad, Good, Meh, Good, Bad: 5, 4, 3, 4, 2 on five different weekdays.
    const means = ["5.00", "4.00", "3.00", "4.00", "2.00"];
    for (const [back, mean] of means.entries()) {
      const weekday = new Date(
        `${LogPageObject.addDays(today, -back)}T12:00:00Z`,
      ).toLocaleDateString("en", {
        weekday: "long",
        timeZone: "UTC",
      });
      await expect(insights.weekdayRow(weekday)).toHaveAccessibleName(
        `${weekday} 1 1 ${mean}`,
      );
    }
  });

  test("should count only the days of the period that the owner picks", async ({
    page,
  }) => {
    test.slow();
    const insights = new InsightsPageObject(page);
    const today = await recordFiveDays(page);
    await insights.open();

    await insights.chooseCustomRange({
      from: LogPageObject.addDays(today, -1),
      to: today,
    });

    await expect(insights.summary).toMatchAriaSnapshot(`
      - group "Selected period summary":
        - strong: "2"
        - text: recorded days
        - strong: 100%
        - text: of days recorded
        - strong: "1"
        - text: activities recorded
    `);
    await insights.choosePeriod("Last 90 days");
    await expect(insights.summary).toMatchAriaSnapshot(`
      - group "Selected period summary":
        - strong: "5"
        - text: recorded days
    `);
  });

  test("should say so when the period has no entries", async ({ page }) => {
    test.slow();
    const insights = new InsightsPageObject(page);
    const today = await recordFiveDays(page);
    await insights.open();

    await insights.chooseCustomRange({
      from: LogPageObject.addDays(today, -40),
      to: LogPageObject.addDays(today, -30),
    });

    await expect(insights.emptyPeriod).toBeVisible();
    await expect(insights.sectionLink("Activities")).toBeHidden();
  });

  test("should refuse a period that ends before it starts", async ({
    page,
  }) => {
    test.slow();
    const insights = new InsightsPageObject(page);
    const today = await recordFiveDays(page);
    await insights.open();

    await insights.chooseCustomRange({
      from: today,
      to: LogPageObject.addDays(today, -2),
    });

    await expect(insights.invalidRange).toBeVisible();
    await expect(insights.summary).toBeHidden();
  });

  test("should not count a day that was chosen but not saved", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    const insights = new InsightsPageObject(page);
    await log.goto();
    await log.logDay({ mood: "Good" });
    await log.goToPreviousDay();
    await log.chooseMood("Bad");

    await insights.open();

    await expect(insights.summary).toMatchAriaSnapshot(`
      - group "Selected period summary":
        - strong: "1"
        - text: recorded days
    `);
  });
});
