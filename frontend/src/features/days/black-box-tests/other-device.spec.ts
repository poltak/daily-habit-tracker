import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { PasskeySignInPageObject } from "../../auth/black-box-tests/passkey-sign-in-page-object.js";
import { LogPageObject } from "./log-page-object.js";

const WALK = { group: "Health", name: "Walk" };

test.describe("a second device changes the open day", () => {
  test("should show a change from another device within the refresh time, with no reload", async ({
    page,
    otherDevicePage,
    setupCode,
  }) => {
    test.slow();
    const log = new LogPageObject(page);
    const otherLog = new LogPageObject(otherDevicePage);
    const otherSignIn = new PasskeySignInPageObject(otherDevicePage);
    await otherSignIn.goto();
    await otherSignIn.recover(setupCode);
    await otherLog.waitUntilLoaded();
    await log.goto();
    await expect(log.chosenMood("Good")).toBeHidden();

    await otherLog.logDay({ mood: "Good", activities: [WALK] });

    await expect(log.chosenMood("Good")).toBeVisible({ timeout: 20_000 });
    await expect(log.selectedActivity("Walk")).toBeVisible();
    await expect(log.saveTitle).toHaveText("Your entry is saved");
  });
});
