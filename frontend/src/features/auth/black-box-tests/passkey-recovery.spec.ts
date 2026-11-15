import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { LogPageObject } from "../../days/black-box-tests/log-page-object.js";
import { PasskeySignInPageObject } from "./passkey-sign-in-page-object.js";

test.use({ authenticated: false, passkeyDevice: true });

test.describe("sign in on another device with the setup code", () => {
  test("should add a passkey on a second device and open the journal there", async ({
    page,
    otherDevicePage,
    setupCode,
  }) => {
    const signIn = new PasskeySignInPageObject(page);
    await signIn.goto();
    await signIn.setUp(setupCode);
    const otherSignIn = new PasskeySignInPageObject(otherDevicePage);
    const otherLog = new LogPageObject(otherDevicePage);

    await otherSignIn.goto();
    await expect(otherSignIn.signInHeading).toBeVisible();
    await otherSignIn.recover(setupCode);

    await otherLog.waitUntilLoaded();
    await expect(otherLog.heading).toBeVisible();
  });

  test("should show the recovery form with a way back to sign-in", async ({
    page,
    otherDevicePage,
    setupCode,
  }) => {
    const signIn = new PasskeySignInPageObject(page);
    await signIn.goto();
    await signIn.setUp(setupCode);
    const other = new PasskeySignInPageObject(otherDevicePage);
    await other.goto();

    await other.openRecovery();
    await expect(other.setupCodeField).toBeVisible();
    await expect(other.addPasskeyHeading).toBeVisible();
    await other.backToSignInButton.click();

    await expect(other.signInHeading).toBeVisible();
    await expect(other.signInButton).toBeVisible();
  });

  test("should refuse a wrong setup code on the recovery form", async ({
    page,
    otherDevicePage,
    setupCode,
  }) => {
    const signIn = new PasskeySignInPageObject(page);
    await signIn.goto();
    await signIn.setUp(setupCode);
    const other = new PasskeySignInPageObject(otherDevicePage);
    await other.goto();
    await other.openRecovery();

    await other.submitSetupCode("not the setup code");

    await expect(other.error("This setup code is not correct.")).toBeVisible();
    await expect(other.addPasskeyHeading).toBeVisible();
  });
});
