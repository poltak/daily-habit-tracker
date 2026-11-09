import type { Download, Locator, Page } from "@playwright/test";

type Theme = "System" | "Light" | "Dark";

/**
 * The Setup page: theme, week, the catalog of groups, activities and goals,
 * the export, and the sign-in with passkeys.
 */
export class SetupPageObject {
  constructor(private readonly page: Page) {}

  get heading(): Locator {
    return this.page.getByRole("heading", { level: 1, name: "Make it yours" });
  }

  get main(): Locator {
    return this.page.getByRole("main");
  }

  /** A message above the page, such as "Setup updated.". */
  notice(text: string): Locator {
    return this.page.getByRole("status").filter({ hasText: text });
  }

  async goto(): Promise<void> {
    await this.page.goto("/?view=settings");
    await this.heading.waitFor();
  }

  async open(): Promise<void> {
    await this.page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Setup", exact: true })
      .click();
    await this.heading.waitFor();
  }

  // Theme

  themeOption(theme: Theme): Locator {
    return this.page.getByRole("radio", { name: new RegExp(`^${theme} `) });
  }

  /** Pick a theme by its name. The radio is hidden behind the theme card, so the card gets the click. */
  async chooseTheme(theme: Theme): Promise<void> {
    await this.page.getByText(theme, { exact: true }).click();
  }

  /** Change the theme that the device asks for, as a phone does at sunset. */
  async setDeviceTheme(theme: "light" | "dark"): Promise<void> {
    await this.page.emulateMedia({ colorScheme: theme });
  }

  // Week

  get weekEndsField(): Locator {
    return this.page.getByRole("combobox", { name: "Week ends on" });
  }

  /** The sentence about the week, such as "…calendars run Monday–Sunday. …". */
  weekDescription(range: string): Locator {
    return this.page.getByText(`calendars run ${range}.`);
  }

  async chooseWeekEnd(day: string): Promise<void> {
    await this.weekEndsField.selectOption({ label: day });
  }

  // Groups and activities

  /** The heading of the activities, such as "12 active activities in 5 groups". */
  activitiesHeading(text: string): Locator {
    return this.page.getByRole("heading", { level: 2, name: text });
  }

  get filterField(): Locator {
    return this.page.getByRole("textbox", {
      name: "Filter activities to manage",
    });
  }

  get noFilterMatches(): Locator {
    return this.page.getByText("No activities match that filter.");
  }

  group(name: string): Locator {
    return this.page.getByRole("group", { name, exact: true });
  }

  /** The count line of a group, such as "3 active · 1 archived". */
  groupCount(group: string, text: string): Locator {
    return this.group(group).getByText(text, { exact: true });
  }

  /** The text of an empty group. */
  emptyGroup(group: string): Locator {
    return this.group(group).getByText("No activities in this group.");
  }

  /** A row of the lists. `name` is a group, an activity, or a goal. */
  renameButton(name: string): Locator {
    return this.page.getByRole("button", {
      name: `Rename ${name}`,
      exact: true,
    });
  }

  moveUpButton(name: string): Locator {
    return this.page.getByRole("button", {
      name: `Move ${name} up`,
      exact: true,
    });
  }

  moveDownButton(name: string): Locator {
    return this.page.getByRole("button", {
      name: `Move ${name} down`,
      exact: true,
    });
  }

  archiveButton(name: string): Locator {
    return this.page.getByRole("button", {
      name: `Archive ${name}`,
      exact: true,
    });
  }

  restoreButton(name: string): Locator {
    return this.page.getByRole("button", {
      name: `Restore ${name}`,
      exact: true,
    });
  }

  deleteButton(name: string): Locator {
    return this.page.getByRole("button", {
      name: `Delete ${name}`,
      exact: true,
    });
  }

  chooseIconButton(activity: string): Locator {
    return this.page.getByRole("button", {
      name: `Choose icon for ${activity}`,
      exact: true,
    });
  }

  configureButton(goal: string): Locator {
    return this.page.getByRole("button", {
      name: `Configure ${goal}`,
      exact: true,
    });
  }

  /** The choice of group for an activity. */
  groupFieldOf(activity: string): Locator {
    return this.page.getByRole("combobox", {
      name: `Move ${activity} to group`,
      exact: true,
    });
  }

  addActivityButton(group: string): Locator {
    return this.page.getByRole("button", {
      name: `Add new activity to ${group}`,
    });
  }

  get newGroupField(): Locator {
    return this.page.getByRole("textbox", { name: "New group name" });
  }

  get addGroupButton(): Locator {
    return this.page.getByRole("button", { name: "Add group" });
  }

  /** Open a group of the list, unless it is open. `probe` is a button inside it. */
  async openGroup(group: string, probe: Locator): Promise<void> {
    if (!(await probe.isVisible())) {
      await this.group(group).getByText(group).first().click();
    }
  }

  /** Press "+ Add new" of a group, which only an open group shows. */
  async startAddActivity(group: string): Promise<void> {
    if (!(await this.addActivityButton(group).isVisible())) {
      await this.group(group).getByText(group).first().click();
    }
    await this.addActivityButton(group).click();
  }

  async filterActivities(query: string): Promise<void> {
    await this.filterField.fill(query);
  }

  /** Answer the question of the browser, and return the text of the question. */
  private async answer(
    action: () => Promise<void>,
    answer: { accept: boolean; text?: string },
  ): Promise<string> {
    const asked = new Promise<string>((resolve) => {
      this.page.once("dialog", (dialog) => {
        resolve(dialog.message());
        if (answer.accept) {
          void dialog.accept(answer.text);
        } else {
          void dialog.dismiss();
        }
      });
    });
    await action();
    return asked;
  }

  /** Rename a group, an activity, or a goal. Returns the question text. */
  async rename(name: string, newName: string): Promise<string> {
    return this.answer(() => this.renameButton(name).click(), {
      accept: true,
      text: newName,
    });
  }

  /** Ask to rename, and cancel the question. Returns the text of the question. */
  async declineRename(name: string): Promise<string> {
    return this.answer(() => this.renameButton(name).click(), {
      accept: false,
    });
  }

  /** Delete a group, an activity, or a goal after the owner agrees. Returns the warning. */
  async delete(name: string): Promise<string> {
    return this.answer(() => this.deleteButton(name).click(), { accept: true });
  }

  /** Ask to delete, and say no. Returns the warning. */
  async declineDelete(name: string): Promise<string> {
    return this.answer(() => this.deleteButton(name).click(), {
      accept: false,
    });
  }

  async addGroup(name: string): Promise<void> {
    await this.newGroupField.fill(name);
    await this.addGroupButton.click();
  }

  // Goals

  /** The heading of the goals, such as "2 active · 2 total". */
  goalsHeading(text: string): Locator {
    return this.page.getByRole("heading", { level: 2, name: text });
  }

  /** The line under a goal, such as "3 days per week · Gym". */
  goalDetail(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }

  get newGoalField(): Locator {
    return this.page.getByRole("textbox", { name: "New goal name" });
  }

  get addGoalButton(): Locator {
    return this.page.getByRole("button", { name: "Add goal" });
  }

  async addGoal(name: string): Promise<void> {
    await this.newGoalField.fill(name);
    await this.addGoalButton.click();
  }

  // Export

  get exportButton(): Locator {
    return this.page.getByRole("button", { name: "Export JSON" });
  }

  /** Press Export, and return the file that the browser downloads. */
  async exportData(): Promise<Download> {
    const download = this.page.waitForEvent("download");
    await this.exportButton.click();
    return download;
  }

  // Sign-in

  get signInHeading(): Locator {
    return this.page.getByRole("heading", {
      level: 2,
      name: "Passkeys and connected apps",
    });
  }

  get addPasskeyButton(): Locator {
    return this.page.getByRole("button", {
      name: "Add a passkey on this device",
    });
  }

  get signOutButton(): Locator {
    return this.page.getByRole("button", { name: "Sign out" });
  }

  /** The remove button of every passkey. */
  get removePasskeyButtons(): Locator {
    return this.page.getByRole("button", { name: /^Remove passkey / });
  }

  /** The remove button of the first passkey in the list, which is the oldest, or of the last one. */
  removePasskeyButton(position: "first" | "last"): Locator {
    return position === "first"
      ? this.removePasskeyButtons.first()
      : this.removePasskeyButtons.last();
  }

  /** The row of the passkey that this device signed in with. */
  get thisDevicePasskey(): Locator {
    return this.page.getByText(/ · this device$/);
  }

  get noConnectedApps(): Locator {
    return this.page.getByText(/^No apps are connected\./);
  }

  /** Remove a passkey after the owner agrees. Returns the warning. */
  async removePasskey(position: "first" | "last"): Promise<string> {
    return this.answer(() => this.removePasskeyButton(position).click(), {
      accept: true,
    });
  }

  /** Ask to remove a passkey, and say no. Returns the warning. */
  async declineRemovePasskey(position: "first" | "last"): Promise<string> {
    return this.answer(() => this.removePasskeyButton(position).click(), {
      accept: false,
    });
  }

  async addPasskey(): Promise<void> {
    await this.addPasskeyButton.click();
  }

  async signOut(): Promise<void> {
    await this.signOutButton.click();
    await this.heading.waitFor({ state: "hidden" });
  }
}
