import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { LogPageObject } from "./log-page-object.js";

// The journal's today is the day on the owner's own clock. The two zones are
// the furthest ahead of UTC and the furthest behind it, so one of them is on
// another date than UTC for part of each day.
for (const timeZone of ["Pacific/Kiritimati", "Etc/GMT+12"]) {
  test.describe(`a browser in ${timeZone}`, () => {
    test.use({ timezoneId: timeZone });

    test("should open the day of the owner's clock and save it", async ({
      page,
    }) => {
      const log = new LogPageObject(page);
      const localToday = LogPageObject.todayIn(timeZone);
      await log.goto();

      await expect(log.dateField).toHaveValue(localToday);
      await expect(log.heading).toHaveText("How was your day?");
      await expect(log.dayLabel(localToday)).toBeVisible();
      await expect(log.nextDayButton).toBeDisabled();
      await log.logDay({ mood: "Good" });
      await log.goToPreviousDay();
      await expect(log.heading).toHaveText("How was yesterday?");
      await expect(log.dateField).toHaveValue(
        LogPageObject.addDays(localToday, -1),
      );
      await log.goToToday();
      await expect(log.chosenMood("Good")).toBeVisible();
      await expect(log.saveTitle).toHaveText("Your entry is saved");
    });
  });
}
