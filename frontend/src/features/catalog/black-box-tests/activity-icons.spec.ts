import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { SetupPageObject } from "../../settings/black-box-tests/setup-page-object.js";
import { AddActivityPageObject } from "./add-activity-page-object.js";
import { IconPickerPageObject } from "./icon-picker-page-object.js";

test.describe("activity icons", () => {
  test("should open the icon dialog with the icon of the activity chosen", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    const picker = new IconPickerPageObject(page);
    await setup.goto();
    await setup.openGroup("Health", setup.chooseIconButton("Gym"));

    await setup.chooseIconButton("Gym").click();

    await expect(picker.dialog).toBeVisible();
    await expect(picker.kind("Activity icon")).toBeVisible();
    await expect(picker.subject("For Gym")).toBeVisible();
    await expect(picker.count("Showing 120 of")).toBeVisible();
    await expect(picker.chosenIcon("fitness center")).toBeVisible();
  });

  test("should change the icon of an activity, and keep it after a reload", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    const picker = new IconPickerPageObject(page);
    await setup.goto();
    await setup.openGroup("Health", setup.chooseIconButton("Walk"));
    await setup.chooseIconButton("Walk").click();

    await picker.choose("pool");

    await expect(setup.notice("Setup updated.")).toBeVisible();
    await setup.goto();
    await setup.openGroup("Health", setup.chooseIconButton("Walk"));
    await setup.chooseIconButton("Walk").click();
    await expect(picker.chosenIcon("pool")).toBeVisible();
    await expect(picker.chosenIcon("directions walk")).toBeHidden();
  });

  test("should find icons with a search, and say so when none match", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    const picker = new IconPickerPageObject(page);
    await setup.goto();
    await setup.openGroup("Home", setup.chooseIconButton("Cook"));
    await setup.chooseIconButton("Cook").click();

    await picker.search("pool");

    await expect(picker.icon("pool")).toBeVisible();
    await expect(picker.icon("fitness center")).toBeHidden();
    await picker.search("no icon has this name");
    await expect(picker.noMatches).toBeVisible();
    await picker.search("");
    await expect(picker.noMatches).toBeHidden();
    await expect(picker.icon("category")).toBeVisible();
  });

  test("should list the icons of a category, and show more of them", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    const picker = new IconPickerPageObject(page);
    await setup.goto();
    await setup.openGroup("Home", setup.chooseIconButton("Cook"));
    await setup.chooseIconButton("Cook").click();

    await picker.chooseCategory("Food");

    await expect(picker.icon("restaurant")).toBeVisible();
    await expect(picker.icon("fitness center")).toBeHidden();
    await expect(picker.category("Food")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await picker.chooseCategory("All");
    await expect(picker.count("Showing 120 of")).toBeVisible();
    await picker.showMoreButton.click();
    await expect(picker.count("Showing 240 of")).toBeVisible();
  });

  test("should close the dialog and keep the icon, with the close button and with Escape", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    const picker = new IconPickerPageObject(page);
    await setup.goto();
    await setup.openGroup("Home", setup.chooseIconButton("Cook"));
    await setup.chooseIconButton("Cook").click();

    await picker.close();
    await setup.chooseIconButton("Cook").click();
    await picker.closeWithEscape();

    await expect(picker.dialog).toBeHidden();
    await expect(setup.notice("Setup updated.")).toBeHidden();
    await setup.chooseIconButton("Cook").click();
    await expect(picker.chosenIcon("restaurant")).toBeVisible();
  });

  test("should choose the icon of a new activity", async ({ page }) => {
    const setup = new SetupPageObject(page);
    const form = new AddActivityPageObject(page);
    const picker = new IconPickerPageObject(page);
    await setup.goto();
    await setup.startAddActivity("Health");
    await form.fillName("Swimming");

    await form.iconButton.click();
    await expect(picker.subject("For Swimming")).toBeVisible();
    await picker.choose("pool");
    await form.addButton.click();
    await form.heading.waitFor({ state: "hidden" });

    await setup.openGroup("Health", setup.chooseIconButton("Swimming"));
    await setup.chooseIconButton("Swimming").click();
    await expect(picker.chosenIcon("pool")).toBeVisible();
  });
});
