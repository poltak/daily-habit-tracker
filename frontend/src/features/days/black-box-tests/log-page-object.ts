import type { Locator, Page } from "@playwright/test";

export interface ActivityRef {
  group: string;
  name: string;
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** The daily entry: goals, mood, activities, and the day switcher in the header. */
export class LogPageObject {
  constructor(private readonly page: Page) {}

  /** The date of `iso` moved by `days`, as `YYYY-MM-DD`. */
  static addDays(iso: string, days: number): string {
    const date = new Date(`${iso}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  /** A date as the page writes it, such as "Monday, November 9, 2026". */
  static friendlyDate(iso: string): string {
    const date = new Date(`${iso}T12:00:00Z`);
    return `${WEEKDAYS[date.getUTCDay()]}, ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
  }

  /** A date as a message writes it, such as "Nov 9". */
  static shortDate(iso: string): string {
    return LogPageObject.longDate(iso).replace(/^(\w{3})\w*/, "$1");
  }

  /** A date as the header writes it for an earlier day, such as "November 9". */
  static longDate(iso: string): string {
    const date = new Date(`${iso}T12:00:00Z`);
    return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
  }

  /** The calendar date that a clock in `timeZone` shows now. */
  static todayIn(timeZone: string): string {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }

  get form(): Locator {
    return this.page.getByRole("group", { name: "Daily entry form" });
  }

  /** The heading, such as "How was your day?" or "How was yesterday?". */
  get heading(): Locator {
    return this.page.getByRole("heading", { level: 1, name: /^How was / });
  }

  get previousDayButton(): Locator {
    return this.page.getByRole("button", { name: "Previous day" });
  }

  get nextDayButton(): Locator {
    return this.page.getByRole("button", { name: "Next day" });
  }

  get todayButton(): Locator {
    return this.page.getByRole("button", { name: "Today", exact: true });
  }

  get dateField(): Locator {
    return this.page.getByLabel("Journal date");
  }

  /** The day in the header, such as "Monday, November 9, 2026". */
  dayLabel(iso: string): Locator {
    return this.page
      .getByRole("banner")
      .getByText(LogPageObject.friendlyDate(iso), { exact: true });
  }

  mood(name: string): Locator {
    return this.form.getByRole("button", { name, exact: true });
  }

  /** The button of the mood that the day has. It shows as pressed. */
  chosenMood(name: string): Locator {
    return this.form.getByRole("button", { name, exact: true, pressed: true });
  }

  /** An activity button inside its group. The group must be open. */
  activity({ group, name }: ActivityRef): Locator {
    return this.page
      .getByRole("group", { name: group, exact: true })
      .getByRole("button", { name, exact: true });
  }

  /** The button of an activity that the day has. It shows as pressed. */
  chosenActivity({ group, name }: ActivityRef): Locator {
    return this.page
      .getByRole("group", { name: group, exact: true })
      .getByRole("button", { name, exact: true, pressed: true });
  }

  /** The chip of a selected activity, above the search field. */
  selectedActivity(name: string): Locator {
    return this.page
      .getByRole("group", { name: "Selected activities" })
      .getByRole("button", { name, exact: true });
  }

  get selectedActivitiesEmpty(): Locator {
    return this.page.getByText("Selected activities appear here.");
  }

  /** The count above the chips, such as "2 selected". */
  selectedCount(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }

  /** The group of activities in the list, closed or open. */
  group(name: string): Locator {
    return this.page.getByRole("group", { name, exact: true });
  }

  /** The summary of a group, such as "Health 3 activities". */
  groupSummary(name: string, count: number): Locator {
    return this.group(name).getByText(
      `${count} ${count === 1 ? "activity" : "activities"}`,
      { exact: true },
    );
  }

  addActivityButton(group: string): Locator {
    return this.page.getByRole("button", {
      name: `Add new activity to ${group}`,
    });
  }

  get searchField(): Locator {
    return this.page.getByRole("textbox", { name: "Search activities" });
  }

  get noSearchMatches(): Locator {
    return this.page.getByText("No activities match that search.");
  }

  /** The switch of a goal that the day has not completed. */
  openGoalSwitch(name: string): Locator {
    return this.form.getByRole("button", { name: `Mark ${name} completed` });
  }

  /** The switch of a goal that the day has completed. */
  doneGoalSwitch(name: string): Locator {
    return this.form.getByRole("button", {
      name: `Mark ${name} not completed`,
    });
  }

  goalOpenButton(name: string): Locator {
    return this.form.getByRole("button", { name: `Open ${name} goal` });
  }

  /** The description under a goal, such as "3 days this week · Gym". */
  goalDescription(text: string): Locator {
    return this.form.getByText(text, { exact: true });
  }

  /** The count of completed goals, such as "1/2". */
  get goalCount(): Locator {
    return this.page.getByLabel("Completed goals");
  }

  get saveButton(): Locator {
    return this.page.getByRole("button", { name: "Save entry" });
  }

  /** The disabled button that replaces the save button once the entry is saved. */
  get savedButton(): Locator {
    return this.page.getByRole("button", { name: "Saved", exact: true });
  }

  get deleteButton(): Locator {
    return this.page.getByRole("button", { name: "Delete", exact: true });
  }

  /** "Ready to save your day?" or "Your entry is saved". */
  get saveTitle(): Locator {
    return this.page.getByText(
      /^(Ready to save your day\?|Your entry is saved)$/,
    );
  }

  /** The line under the save title, such as "Monday, November 9, 2026 · 1 activity". */
  saveDetail(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }

  /** A message above the form, such as "Saved Nov 9.". */
  notice(text: string): Locator {
    return this.page.getByRole("status").filter({ hasText: text });
  }

  get retryDayButton(): Locator {
    return this.page.getByRole("button", { name: "Retry day" });
  }

  async goto(path = "/"): Promise<void> {
    await this.page.goto(path);
    await this.waitUntilLoaded();
  }

  /** Wait until the day has loaded and its buttons take clicks. */
  async waitUntilLoaded(): Promise<void> {
    await this.page
      .getByRole("button", { name: "Rad", exact: true, disabled: false })
      .waitFor();
  }

  /** Open the log from the bottom navigation. */
  async open(): Promise<void> {
    await this.page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Log", exact: true })
      .click();
    await this.waitUntilLoaded();
  }

  async chooseMood(name: string): Promise<void> {
    await this.mood(name).click();
    // The button takes clicks again when the day is stored.
    await this.page
      .getByRole("button", {
        name,
        exact: true,
        pressed: true,
        disabled: false,
      })
      .waitFor();
  }

  /** Open the group of an activity, unless it is open. */
  async openGroup({ group, name }: ActivityRef): Promise<void> {
    if (!(await this.activity({ group, name }).isVisible())) {
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

  async toggleActivity(activity: ActivityRef): Promise<void> {
    await this.openGroup(activity);
    await this.activity(activity).click();
    // The button takes clicks again when the day is stored.
    await this.page
      .getByRole("group", { name: activity.group, exact: true })
      .getByRole("button", {
        name: activity.name,
        exact: true,
        disabled: false,
      })
      .waitFor();
  }

  async completeGoal(name: string): Promise<void> {
    await this.openGoalSwitch(name).click();
    // The switch takes clicks again when the day is stored.
    await this.form
      .getByRole("button", {
        name: `Mark ${name} not completed`,
        disabled: false,
      })
      .waitFor();
  }

  async uncompleteGoal(name: string): Promise<void> {
    await this.doneGoalSwitch(name).click();
    await this.form
      .getByRole("button", { name: `Mark ${name} completed`, disabled: false })
      .waitFor();
  }

  async searchActivities(query: string): Promise<void> {
    await this.searchField.fill(query);
  }

  async openGoal(name: string): Promise<void> {
    await this.goalOpenButton(name).click();
    await this.goalOpenButton(name).waitFor({ state: "hidden" });
  }

  async save(): Promise<void> {
    await this.saveButton.click();
    await this.savedButton.waitFor();
  }

  /** Ask to delete the saved entry of the open day, and agree to the question. */
  async askToDeleteEntry(): Promise<void> {
    this.page.once("dialog", (dialog) => void dialog.accept());
    await this.deleteButton.click();
  }

  /** Delete the saved entry of the open day, and wait until it is gone. */
  async deleteEntry(): Promise<void> {
    await this.askToDeleteEntry();
    await this.deleteButton.waitFor({ state: "hidden" });
  }

  /** Ask to delete the saved entry, and say no to the question. */
  async declineDeleteEntry(): Promise<string> {
    let question = "";
    this.page.once("dialog", (dialog) => {
      question = dialog.message();
      void dialog.dismiss();
    });
    await this.deleteButton.click();
    await this.deleteButton.waitFor({ state: "visible" });
    return question;
  }

  async goToPreviousDay(): Promise<void> {
    const before = await this.dateField.inputValue();
    await this.previousDayButton.click();
    await this.waitForDay(LogPageObject.addDays(before, -1));
  }

  async goToNextDay(): Promise<void> {
    const before = await this.dateField.inputValue();
    await this.nextDayButton.click();
    await this.waitForDay(LogPageObject.addDays(before, 1));
  }

  async goToToday(): Promise<void> {
    await this.todayButton.click();
    await this.waitUntilLoaded();
  }

  /** Open a day with the date field. The field takes `YYYY-MM-DD`. */
  async goToDay(iso: string): Promise<void> {
    await this.dateField.fill(iso);
    await this.waitForDay(iso);
  }

  /** Type a date in the date field, and do not wait for the day. */
  async tryDay(iso: string): Promise<void> {
    await this.dateField.fill(iso);
  }

  /** The date that the log shows now, as `YYYY-MM-DD`. */
  async currentDate(): Promise<string> {
    return this.dateField.inputValue();
  }

  /** Wait until the log shows `iso` and the day has loaded. */
  async waitForDay(iso: string): Promise<void> {
    await this.dayLabel(iso).waitFor();
    await this.waitUntilLoaded();
  }

  /**
   * Record a day: pick the mood and the activities, then save. The page
   * must show that day already.
   */
  async logDay(input: {
    mood: string;
    activities?: ActivityRef[];
  }): Promise<void> {
    await this.chooseMood(input.mood);
    for (const activity of input.activities ?? []) {
      await this.toggleActivity(activity);
      await this.selectedActivity(activity.name).waitFor();
    }
    await this.save();
  }
}
