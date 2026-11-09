import type { Locator, Page } from "@playwright/test";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** One goal: its settings, its month of completed days, and its weekly results. */
export class GoalPageObject {
  constructor(private readonly page: Page) {}

  /** The Monday of the week of `iso`, when weeks run Monday to Sunday. */
  static weekStart(iso: string): string {
    const date = new Date(`${iso}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return date.toISOString().slice(0, 10);
  }

  /** The heading, which is the name of the goal. */
  heading(name: string): Locator {
    return this.page.getByRole("heading", { level: 1, name, exact: true });
  }

  /** A message above the page, such as "Goal updated.". */
  notice(text: string): Locator {
    return this.page.getByRole("status").filter({ hasText: text });
  }

  get backButton(): Locator {
    return this.page
      .getByRole("main")
      .getByRole("button", { name: "Goals", exact: true });
  }

  get nameField(): Locator {
    return this.page.getByRole("textbox", { name: "Name" });
  }

  get repeatField(): Locator {
    return this.page.getByRole("combobox", { name: "Repeat" });
  }

  get activityField(): Locator {
    return this.page.getByRole("combobox", { name: "Associated activity" });
  }

  get iconButton(): Locator {
    return this.page.getByRole("button", { name: "Choose goal icon" });
  }

  /** The checkbox of a weekday, for a daily goal. */
  weekday(day: Weekday): Locator {
    return this.page.getByRole("checkbox", { name: day, exact: true });
  }

  /** The radio of the days per week, for a weekly goal: "3 days per week" or "Every day". */
  daysPerWeek(label: string): Locator {
    return this.page.getByRole("radio", { name: label, exact: true });
  }

  get saveButton(): Locator {
    return this.page.getByRole("button", { name: "Save goal" });
  }

  get unsavedNote(): Locator {
    return this.page.getByText("Unsaved goal changes");
  }

  get archiveButton(): Locator {
    return this.page.getByRole("button", { name: "Archive goal" });
  }

  get deleteButton(): Locator {
    return this.page.getByRole("button", { name: "Delete goal" });
  }

  // History

  /** The month shown, such as "November 2026". */
  get monthHeading(): Locator {
    return this.page
      .getByRole("heading", { level: 2 })
      .filter({ hasText: /^[A-Z][a-z]+ \d{4}$/ });
  }

  get previousMonthButton(): Locator {
    return this.page.getByRole("button", { name: "Previous month" });
  }

  get nextMonthButton(): Locator {
    return this.page.getByRole("button", { name: "Next month" });
  }

  /** The sentence about the history, such as "Each week needs 3 completed days.". */
  explainer(text: string): Locator {
    return this.page.getByText(text);
  }

  /** The cell of a day: "2026-11-09: completed" or "2026-11-09: not completed". */
  day(iso: string, state: "completed" | "not completed"): Locator {
    return this.page.getByRole("img", {
      name: new RegExp(`^${iso}: ${state}`),
    });
  }

  /** The row of a week, such as "Nov 2 – Nov 8". It holds the result, such as "Accomplished · 3/3 days". */
  week(dates: string): Locator {
    return this.page.getByRole("group", { name: dates, exact: true });
  }

  /** Open the goal from the log. */
  async openFromLog(name: string): Promise<void> {
    await this.page.getByRole("button", { name: `Open ${name} goal` }).click();
    await this.heading(name).waitFor();
  }

  /** Open the goal from the setup page. */
  async openFromSetup(name: string): Promise<void> {
    await this.page
      .getByRole("button", { name: `Configure ${name}`, exact: true })
      .click();
    await this.heading(name).waitFor();
  }

  async rename(name: string): Promise<void> {
    await this.nameField.fill(name);
  }

  async chooseRepeat(repeat: "Daily" | "Weekly"): Promise<void> {
    await this.repeatField.selectOption({ label: repeat });
  }

  async chooseActivity(name: string): Promise<void> {
    await this.activityField.selectOption({ label: name });
  }

  /** Save the changes, and wait until the page says they are saved. */
  async save(): Promise<void> {
    await this.saveButton.click();
    await this.notice("Goal updated.").waitFor();
  }

  /** Press Save, and do not wait. For changes that the app refuses. */
  async trySave(): Promise<void> {
    await this.saveButton.click();
  }

  /** Go back to the page that opened the goal. */
  async goBack(): Promise<void> {
    await this.backButton.click();
    await this.backButton.waitFor({ state: "hidden" });
  }

  async archive(): Promise<void> {
    await this.archiveButton.click();
    await this.archiveButton.waitFor({ state: "hidden" });
  }

  /** Delete the goal after the owner agrees. Returns the warning. */
  async delete(): Promise<string> {
    const asked = new Promise<string>((resolve) => {
      this.page.once("dialog", (dialog) => {
        resolve(dialog.message());
        void dialog.accept();
      });
    });
    await this.deleteButton.click();
    const warning = await asked;
    await this.deleteButton.waitFor({ state: "hidden" });
    return warning;
  }

  /** Ask to delete the goal, and say no. Returns the warning. */
  async declineDelete(): Promise<string> {
    const asked = new Promise<string>((resolve) => {
      this.page.once("dialog", (dialog) => {
        resolve(dialog.message());
        void dialog.dismiss();
      });
    });
    await this.deleteButton.click();
    return asked;
  }
}
