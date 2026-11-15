import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { PasskeySignInPageObject } from "../../auth/black-box-tests/passkey-sign-in-page-object.js";
import { LogPageObject } from "./log-page-object.js";

const WALK = { group: "Health", name: "Walk" };

test.describe("two devices save the same day", () => {
  test("should refuse the second save, and show the other device's entry after a reload", async ({
    page,
    otherDevicePage,
    setupCode,
  }) => {
    const log = new LogPageObject(page);
    const otherLog = new LogPageObject(otherDevicePage);
    const otherSignIn = new PasskeySignInPageObject(otherDevicePage);
    await otherSignIn.goto();
    await otherSignIn.recover(setupCode);
    await otherLog.waitUntilLoaded();
    await log.goto();

    await otherLog.logDay({ mood: "Good", activities: [WALK] });
    await log.chooseMood("Bad");
    await log.saveButton.click();

    await expect(
      log.notice("This entry changed on another device. Try again."),
    ).toBeVisible();
    await expect(log.saveTitle).toHaveText("Ready to save your day?");
    await log.goto();
    await expect(log.selectedActivity("Walk")).toBeVisible();
    await expect(log.saveTitle).toHaveText("Your entry is saved");
  });
});
