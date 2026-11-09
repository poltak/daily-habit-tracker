import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { LogPageObject } from "../../days/black-box-tests/log-page-object.js";
import { SetupPageObject } from "../../settings/black-box-tests/setup-page-object.js";

test.describe("reorder groups and activities", () => {
  test("should move a group down and up, and show the order on the log", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    const log = new LogPageObject(page);
    await setup.goto();
    await expect(setup.moveUpButton("Health")).toBeDisabled();
    await expect(setup.moveDownButton("Leisure")).toBeDisabled();

    await setup.moveDownButton("Health").click();

    await expect(setup.notice("Setup updated.")).toBeVisible();
    await expect(setup.moveUpButton("Health")).toBeEnabled();
    await expect(setup.moveUpButton("Work")).toBeDisabled();
    await expect(setup.main).toMatchAriaSnapshot(`
      - group "Work"
      - group "Health"
      - group "Home"
    `);
    await log.open();
    await expect(log.form).toMatchAriaSnapshot(`
      - group "Work"
      - group "Health"
      - group "Home"
    `);
    await setup.open();
    await setup.moveUpButton("Health").click();
    await expect(setup.moveUpButton("Health")).toBeDisabled();
    await expect(setup.main).toMatchAriaSnapshot(`
      - group "Health"
      - group "Work"
    `);
  });

  test("should keep the order of the groups after a reload", async ({
    page,
  }) => {
    const setup = new SetupPageObject(page);
    await setup.goto();
    await setup.moveUpButton("Leisure").click();
    await expect(setup.notice("Setup updated.")).toBeVisible();

    await setup.goto();

    await expect(setup.main).toMatchAriaSnapshot(`
      - group "Leisure"
      - group "People"
    `);
  });

  test("should reorder the activities of a group", async ({ page }) => {
    const setup = new SetupPageObject(page);
    const log = new LogPageObject(page);
    await setup.goto();
    await setup.openGroup("Health", setup.moveUpButton("Gym"));
    await expect(setup.moveUpButton("Gym")).toBeDisabled();
    await expect(setup.moveDownButton("Sleep")).toBeDisabled();

    await setup.moveDownButton("Gym").click();
    await expect(setup.notice("Setup updated.")).toBeVisible();

    await expect(setup.moveUpButton("Walk")).toBeDisabled();
    await expect(setup.group("Health")).toMatchAriaSnapshot(`
      - button "Rename Walk"
      - button "Rename Gym"
      - button "Rename Sleep"
    `);
    await log.open();
    await log.openGroup({ group: "Health", name: "Gym" });
    await expect(log.group("Health")).toMatchAriaSnapshot(`
      - button "Walk"
      - button "Gym"
      - button "Sleep"
    `);
  });

  test("should move the last activity of a group up", async ({ page }) => {
    const setup = new SetupPageObject(page);
    await setup.goto();
    await setup.openGroup("Leisure", setup.moveUpButton("Music"));

    await setup.moveUpButton("Music").click();
    await expect(setup.notice("Setup updated.")).toBeVisible();

    await expect(setup.moveDownButton("Music")).toBeEnabled();
    await expect(setup.group("Leisure")).toMatchAriaSnapshot(`
      - button "Rename Reading"
      - button "Rename Music"
      - button "Rename Gaming"
    `);
  });
});
