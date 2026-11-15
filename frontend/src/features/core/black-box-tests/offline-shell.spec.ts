import { expect } from "@playwright/test";
import { LogPageObject } from "../../days/black-box-tests/log-page-object.js";
import { test } from "./black-box-test.js";
import { OfflineShellPageObject } from "./offline-shell-page-object.js";

test.describe("offline shell", () => {
  test("should show the app shell after a reload with no connection", async ({
    page,
  }) => {
    const log = new LogPageObject(page);
    const offline = new OfflineShellPageObject(page);
    await log.goto();
    await offline.waitForControl();

    await offline.goOffline();
    await offline.reload();

    await expect(offline.sessionCheckFailure).toBeVisible();
  });
});
