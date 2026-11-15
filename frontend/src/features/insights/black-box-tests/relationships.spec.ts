import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { LogPageObject } from "../../days/black-box-tests/log-page-object.js";
import { InsightsPageObject } from "./insights-page-object.js";

const GYM = { group: "Health", name: "Gym" };
const COOK = { group: "Home", name: "Cook" };
const MUSIC = { group: "Leisure", name: "Music" };

test.describe("what an activity does to the days around it", () => {
  test("should compare the days around an activity, and let the owner explore a pair that has too few days for a suggestion", async ({
    page,
  }) => {
    test.slow();
    const log = new LogPageObject(page);
    await log.goto();
    const today = await log.currentDate();
    // Today to four days back: Rad, Good, Meh, Good, Bad.
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
    const insights = new InsightsPageObject(page);
    await insights.open();
    await insights.chooseNextDayActivity("Gym");

    await expect(insights.anchorDays("Gym")).toBeVisible();
    // Gym days are today, 1 and 3 days back. The day after 1 day back is
    // today (Rad), and the day after 3 days back is 2 days back (Meh).
    await expect(
      insights.calendarWindowMoods("Next calendar day", "Meh 1 · Rad 1"),
    ).toBeVisible();
    // The days without Gym are 2 and 4 days back. Each is followed by a Good.
    await expect(
      insights.calendarWindowMoods("Next calendar day", "Good 2"),
    ).toBeVisible();
    await expect(insights.calendarWindow("Next calendar day")).toContainText(
      "4 exact mood observations",
    );
    await expect(insights.calendarWindow("Same calendar day")).toContainText(
      "5 exact mood observations",
    );
    await expect(
      insights.calendarWindow("Previous calendar day"),
    ).toContainText("4 exact mood observations");

    await insights.chooseNextDayActivity("Cook");

    await expect(insights.anchorDays("Cook")).toBeVisible();
    await expect(
      insights.calendarWindowMoods("Next calendar day", "Good 2"),
    ).toBeVisible();

    await expect(insights.noPairSuggestions).toBeVisible();
    await insights.choosePair({ first: "Gym", second: "Cook" });

    await expect(insights.pairDetail("Gym + Cook")).toBeVisible();
    await expect(insights.sparsePair("Sparse: 4 groups")).toBeVisible();
    await expect(
      insights.sparseNote(
        "Neither activity n=0 · A only n=3 · B only n=2 · Both activities n=0.",
      ),
    ).toBeVisible();
    for (const title of [
      "Neither activity",
      "Gym only",
      "Cook only",
      "Both activities",
    ]) {
      await expect(insights.pairGroup(title)).toBeVisible();
    }
  });
});
