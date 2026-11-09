import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { LogPageObject } from "../../days/black-box-tests/log-page-object.js";
import { InsightsPageObject } from "../../insights/black-box-tests/insights-page-object.js";
import { SetupPageObject } from "../../settings/black-box-tests/setup-page-object.js";
import { PasskeySignInPageObject } from "./passkey-sign-in-page-object.js";

test.use({ authenticated: false, passkeyDevice: true });

test.describe("passkey sign-in", () => {
  test("should ask a visitor to set up daymark when it has no passkey, and open the journal after the setup code", async ({
    page,
    setupCode,
  }) => {
    const signIn = new PasskeySignInPageObject(page);
    const log = new LogPageObject(page);
    await signIn.goto();
    await expect(signIn.setUpHeading).toBeVisible();
    await expect(signIn.signInButton).toBeHidden();

    await signIn.setUp(setupCode);

    await log.waitUntilLoaded();
    await expect(log.heading).toHaveText("How was your day?");
  });

  test("should keep the owner signed in after a reload", async ({
    page,
    setupCode,
  }) => {
    const signIn = new PasskeySignInPageObject(page);
    const log = new LogPageObject(page);
    await signIn.goto();
    await signIn.setUp(setupCode);
    await log.waitUntilLoaded();

    await log.goto();

    await expect(log.heading).toBeVisible();
    await expect(signIn.signInHeading).toBeHidden();
  });

  test("should sign the owner in with the saved passkey after a sign-out", async ({
    page,
    setupCode,
  }) => {
    const signIn = new PasskeySignInPageObject(page);
    const log = new LogPageObject(page);
    const setup = new SetupPageObject(page);
    await signIn.goto();
    await signIn.setUp(setupCode);
    await log.waitUntilLoaded();
    await setup.open();
    await setup.signOut();
    await expect(signIn.signInHeading).toBeVisible();

    await signIn.signIn();

    await log.waitUntilLoaded();
    await expect(log.heading).toBeVisible();
  });

  test("should send a visitor to the sign-in page, and back to the page that the visitor asked for", async ({
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

    await signIn.goto("/?view=settings");
    await signIn.signIn();

    await expect(setup.heading).toBeVisible();
  });

  test("should send a visitor of the insights page back to it after sign-in", async ({
    page,
    setupCode,
  }) => {
    const signIn = new PasskeySignInPageObject(page);
    const setup = new SetupPageObject(page);
    const insights = new InsightsPageObject(page);
    await signIn.goto();
    await signIn.setUp(setupCode);
    await setup.open();
    await setup.signOut();

    await signIn.goto("/insights");
    await signIn.signIn();

    await expect(insights.heading).toBeVisible();
  });
});

test.describe("setup code", () => {
  test("should refuse a wrong setup code and stay on the setup page", async ({
    page,
  }) => {
    const signIn = new PasskeySignInPageObject(page);
    await signIn.goto();

    await signIn.submitSetupCode("not the setup code");

    await expect(signIn.error("This setup code is not correct.")).toBeVisible();
    await expect(signIn.setUpHeading).toBeVisible();
    await expect(signIn.setupCodeField).toHaveValue("not the setup code");
  });

  test("should ask for a setup code when the field has only spaces", async ({
    page,
  }) => {
    const signIn = new PasskeySignInPageObject(page);
    await signIn.goto();

    await signIn.submitSetupCode("   ");

    await expect(signIn.error("Type the setup code.")).toBeVisible();
    await expect(signIn.setUpHeading).toBeVisible();
  });

  test("should accept the setup code after a wrong one", async ({
    page,
    setupCode,
  }) => {
    const signIn = new PasskeySignInPageObject(page);
    const log = new LogPageObject(page);
    await signIn.goto();
    await signIn.submitSetupCode("not the setup code");
    await signIn.error("This setup code is not correct.").waitFor();

    await signIn.setUp(setupCode);

    await log.waitUntilLoaded();
    await expect(log.heading).toBeVisible();
  });

  test("should stop a network after ten wrong setup codes", async ({
    page,
  }) => {
    const signIn = new PasskeySignInPageObject(page);
    await signIn.goto();
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      await signIn.submitSetupCode(`wrong code ${attempt}`);
      await signIn.error("This setup code is not correct.").waitFor();
    }

    await signIn.submitSetupCode("wrong code 11");

    await expect(
      signIn.error(
        "Too many wrong setup codes. Wait 15 minutes, then try again.",
      ),
    ).toBeVisible();
    await expect(signIn.setUpHeading).toBeVisible();
  });
});
