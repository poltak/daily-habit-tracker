import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { LogPageObject } from "../../days/black-box-tests/log-page-object.js";
import { SetupPageObject } from "./setup-page-object.js";

// The colour of the text on the page: dark text on the light theme, and light text on the dark one.
const LIGHT_TEXT = "rgb(34, 30, 47)";
const DARK_TEXT = "rgb(244, 241, 249)";

test.describe("theme", () => {
  test.use({ colorScheme: "light" });

  test("should follow the device by default", async ({ page }) => {
    const setup = new SetupPageObject(page);
    await setup.goto();

    await expect(setup.themeOption("System")).toBeChecked();
    await expect(setup.main).toHaveCSS("color", LIGHT_TEXT);
    await setup.setDeviceTheme("dark");
    await expect(setup.main).toHaveCSS("color", DARK_TEXT);
    await setup.setDeviceTheme("light");
    await expect(setup.main).toHaveCSS("color", LIGHT_TEXT);
  });

  test("should switch to the dark theme and back to the light theme", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    await setup.goto();

    await setup.chooseTheme("Dark");
    await expect(setup.themeOption("Dark")).toBeChecked();
    await expect(setup.main).toHaveCSS("color", DARK_TEXT);

    await setup.chooseTheme("Light");
    await expect(setup.themeOption("Light")).toBeChecked();
    await expect(setup.main).toHaveCSS("color", LIGHT_TEXT);
  });

  test("should keep the choice of theme on every page and after a reload", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    const log = new LogPageObject(page);
    await setup.goto();
    await setup.chooseTheme("Dark");
    await expect(setup.main).toHaveCSS("color", DARK_TEXT);

    await log.open();
    await expect(log.form).toHaveCSS("color", DARK_TEXT);
    await setup.goto();

    await expect(setup.themeOption("Dark")).toBeChecked();
    await expect(setup.main).toHaveCSS("color", DARK_TEXT);
  });

  test("should ignore the device once the owner picks a theme", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    await setup.goto();
    await setup.chooseTheme("Light");

    await setup.setDeviceTheme("dark");

    await expect(setup.main).toHaveCSS("color", LIGHT_TEXT);
    await setup.chooseTheme("System");
    await expect(setup.main).toHaveCSS("color", DARK_TEXT);
  });

  test("should describe each theme", async ({ page }) => {
    const setup = new SetupPageObject(page);
    await setup.goto();

    await expect(setup.themeOption("System")).toHaveAccessibleName(
      "System Follow your device setting",
    );
    await expect(setup.themeOption("Light")).toHaveAccessibleName(
      "Light Keep the warm Daymark palette",
    );
    await expect(setup.themeOption("Dark")).toHaveAccessibleName(
      "Dark Use a softer low-light palette",
    );
  });
});
