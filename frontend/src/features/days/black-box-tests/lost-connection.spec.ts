import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { NavigationPageObject } from "../../core/black-box-tests/navigation-page-object.js";
import { LogPageObject } from "./log-page-object.js";

test.describe("a lost connection", () => {
  test("should show that the owner is offline and restore a mood that did not save", async ({
    page,
    context,
  }) => {
    const log = new LogPageObject(page);
    const navigation = new NavigationPageObject(page);
    await log.goto();
    await log.chooseMood("Good");
    await expect(navigation.connection).toHaveText(/online/);

    await context.setOffline(true);
    await log.mood("Rad").click();

    await expect(log.notice("The mood was restored.")).toBeVisible();
    await expect(navigation.connection).toHaveText(/offline/);
    await expect(log.chosenMood("Good")).toBeVisible();
    await expect(log.chosenMood("Rad")).toBeHidden();
    await context.setOffline(false);
    await log.chooseMood("Rad");
    await expect(navigation.connection).toHaveText(/online/);
  });

  test("should not save a day while offline, and save it after the connection returns", async ({
    page,
    context,
  }) => {
    const log = new LogPageObject(page);
    await log.goto();
    await log.chooseMood("Meh");

    await context.setOffline(true);
    await log.saveButton.click();

    await expect(
      log.notice("You’re offline. Reconnect to save this entry."),
    ).toBeVisible();
    await expect(log.saveTitle).toHaveText("Ready to save your day?");
    await context.setOffline(false);
    await log.save();
    await expect(log.saveTitle).toHaveText("Your entry is saved");
  });

  test("should not delete a day while offline", async ({ page, context }) => {
    const log = new LogPageObject(page);
    await log.goto();
    await log.logDay({ mood: "Meh" });

    await context.setOffline(true);
    await log.askToDeleteEntry();

    await expect(
      log.notice("You’re offline. Reconnect before deleting an entry."),
    ).toBeVisible();
    await expect(log.saveTitle).toHaveText("Your entry is saved");
  });
});
