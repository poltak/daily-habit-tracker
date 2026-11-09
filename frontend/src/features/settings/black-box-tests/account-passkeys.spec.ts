import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { PasskeySignInPageObject } from "../../auth/black-box-tests/passkey-sign-in-page-object.js";
import { LogPageObject } from "../../days/black-box-tests/log-page-object.js";
import { SetupPageObject } from "./setup-page-object.js";

test.describe("sign-in section of the setup page", () => {
  test("should show no sign-in section on a local server", async ({ page }) => {
    const setup = new SetupPageObject(page);
    await setup.goto();
    await expect(setup.exportButton).toBeVisible();

    await expect(setup.signInHeading).toBeHidden();
    await expect(setup.signOutButton).toBeHidden();
  });

  test.describe("with passkeys", () => {
    test.use({ authenticated: false, passkeyDevice: true });

    test("should list the passkey of this device, which the owner cannot remove while it is the only one", async ({
      page,
      setupCode,
    }) => {
      const signIn = new PasskeySignInPageObject(page);
      const setup = new SetupPageObject(page);
      await signIn.goto();
      await signIn.setUp(setupCode);

      await setup.open();

      await expect(setup.signInHeading).toBeVisible();
      await expect(setup.removePasskeyButtons).toHaveCount(1);
      await expect(setup.thisDevicePasskey).toBeVisible();
      await expect(setup.removePasskeyButton("first")).toBeDisabled();
      await expect(setup.noConnectedApps).toBeVisible();
    });

    test("should refuse a second passkey on a device that has one", async ({
      page,
      setupCode,
    }) => {
      const signIn = new PasskeySignInPageObject(page);
      const setup = new SetupPageObject(page);
      await signIn.goto();
      await signIn.setUp(setupCode);
      await setup.open();

      await setup.addPasskey();

      await expect(
        setup.notice("This device already has a passkey for this daymark."),
      ).toBeVisible();
      await expect(setup.removePasskeyButtons).toHaveCount(1);
    });

    test("should sign the owner out with the sign-out button", async ({
      page,
      setupCode,
    }) => {
      const signIn = new PasskeySignInPageObject(page);
      const setup = new SetupPageObject(page);
      await signIn.goto();
      await signIn.setUp(setupCode);
      await setup.open();

      await setup.signOut();

      await expect(signIn.signInHeading).toBeVisible();
      await signIn.goto("/");
      await expect(signIn.signInHeading).toBeVisible();
    });

    test("should list the passkey of a second device, and sign that device out when the owner removes its passkey", async ({
      page,
      otherDevicePage,
      setupCode,
    }) => {
      const signIn = new PasskeySignInPageObject(page);
      const setup = new SetupPageObject(page);
      const otherSignIn = new PasskeySignInPageObject(otherDevicePage);
      const otherLog = new LogPageObject(otherDevicePage);
      await signIn.goto();
      await signIn.setUp(setupCode);
      await otherSignIn.goto();
      await otherSignIn.recover(setupCode);
      await otherLog.waitUntilLoaded();
      await setup.open();
      await expect(setup.removePasskeyButtons).toHaveCount(2);
      await expect(setup.removePasskeyButton("first")).toBeEnabled();

      const warning = await setup.removePasskey("last");

      expect(warning).toMatch(
        /^Remove the passkey ".+"\? Devices that signed in with it sign out\.$/,
      );
      await expect(setup.notice("Passkey removed.")).toBeVisible();
      await expect(setup.removePasskeyButtons).toHaveCount(1);
      await expect(setup.removePasskeyButton("first")).toBeDisabled();
      await otherSignIn.goto("/");
      await expect(otherSignIn.signInHeading).toBeVisible();
    });

    test("should keep a passkey when the owner does not agree to remove it", async ({
      page,
      otherDevicePage,
      setupCode,
    }) => {
      const signIn = new PasskeySignInPageObject(page);
      const setup = new SetupPageObject(page);
      const otherSignIn = new PasskeySignInPageObject(otherDevicePage);
      await signIn.goto();
      await signIn.setUp(setupCode);
      await otherSignIn.goto();
      await otherSignIn.recover(setupCode);
      await setup.open();
      await expect(setup.removePasskeyButtons).toHaveCount(2);

      await setup.declineRemovePasskey("last");

      await expect(setup.removePasskeyButtons).toHaveCount(2);
    });

    test("should sign this device out when the owner removes the passkey that signed it in", async ({
      page,
      otherDevicePage,
      setupCode,
    }) => {
      const signIn = new PasskeySignInPageObject(page);
      const setup = new SetupPageObject(page);
      const otherSignIn = new PasskeySignInPageObject(otherDevicePage);
      await signIn.goto();
      await signIn.setUp(setupCode);
      await otherSignIn.goto();
      await otherSignIn.recover(setupCode);
      await setup.open();
      await expect(setup.removePasskeyButtons).toHaveCount(2);

      const warning = await setup.removePasskey("first");

      expect(warning).toMatch(
        /You signed in with it, so this device signs out\.$/,
      );
      await expect(signIn.signInHeading).toBeVisible();
    });
  });
});
