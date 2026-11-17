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

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

test.describe("insights", () => {
  test("should invite the owner to record a day when the journal is empty", async ({
    page,
  }) => {
    const insights = new InsightsPageObject(page);
    await insights.goto();

    await expect(insights.emptyHistory).toBeVisible();
    await expect(insights.summary).toMatchAriaSnapshot(`
      - group "Selected period summary":
        - strong: —
        - text: good days
        - strong: —
        - text: average mood
        - strong: "0"
        - text: recorded days
    `);
    await expect(insights.sectionHeading("Good days by month")).toBeHidden();
  });

  test("should summarize five days in the month table, the activity lists and the weekdays", async ({
    page,
  }) => {
    test.slow();
    const insights = new InsightsPageObject(page);
    const today = await recordFiveDays(page);

    await insights.open();

    // Rad, Good, Meh, Good and Bad score 5, 4, 3, 4 and 2.
    await expect(insights.summary).toMatchAriaSnapshot(`
      - group "Selected period summary":
        - strong: 60%
        - text: good days
        - strong: "3.60"
        - text: average mood
        - strong: "5"
        - text: recorded days
    `);
    await expect(insights.emptyHistory).toBeHidden();

    await expect(insights.sectionHeading("Good days by month")).toBeVisible();
    await expect(
      insights.monthCell({
        month: MONTHS[Number(today.slice(5, 7)) - 1] ?? "",
        year: today.slice(0, 4),
      }),
    ).toHaveText(/^\d+%$/);

    await expect(
      insights.sectionHeading("What goes with better and worse days"),
    ).toBeVisible();
    await expect(insights.moodLinkItems("What you do")).toHaveCount(2);
    await expect(
      insights.moodLinkItems("What you do").nth(0),
    ).toHaveAccessibleName("Gym, 3 days, +1.83");
    await expect(
      insights.moodLinkItems("What you do").nth(1),
    ).toHaveAccessibleName("Cook, 2 days, \u22121.83");
    await expect(insights.moodLinks("How you felt")).toBeHidden();

    await expect(insights.sectionHeading("What changed lately")).toBeVisible();
    await expect(insights.recentShortPeriod).toBeVisible();

    await expect(insights.sectionHeading("Good days by weekday")).toBeVisible();
    await expect(insights.weekdayItems).toHaveCount(7);
    const shares = ["100%", "100%", "0%", "100%", "0%"];
    for (const [back, share] of shares.entries()) {
      const weekday = new Date(
        `${LogPageObject.addDays(today, -back)}T12:00:00Z`,
      ).toLocaleDateString("en", {
        weekday: "long",
        timeZone: "UTC",
      });
      await expect(insights.weekdayItem(weekday)).toHaveAccessibleName(
        `${weekday} ${share}, 1 day`,
      );
    }
  });

  test("should show the period that the owner picks", async ({ page }) => {
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
        - strong: 100%
        - text: good days
        - strong: "4.50"
        - text: average mood
        - strong: "2"
        - text: recorded days
    `);
    await insights.choosePeriod("Last 90 days");
    await expect(insights.summary).toMatchAriaSnapshot(`
      - group "Selected period summary":
        - strong: 60%
        - text: good days
        - strong: "3.60"
        - text: average mood
        - strong: "5"
        - text: recorded days
    `);

    await insights.chooseCustomRange({
      from: LogPageObject.addDays(today, -40),
      to: LogPageObject.addDays(today, -30),
    });

    await expect(insights.emptyPeriod).toBeVisible();
    await expect(insights.sectionHeading("Good days by month")).toBeHidden();

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
        - strong: 100%
        - text: good days
        - strong: "4.00"
        - text: average mood
        - strong: "1"
        - text: recorded days
    `);
  });
});
