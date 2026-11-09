import type { Locator, Page } from "@playwright/test";

/** The insights page: the summary of a period, and what the activities do to the mood. */
export class InsightsPageObject {
  constructor(private readonly page: Page) {}

  get heading(): Locator {
    return this.page.getByRole("heading", {
      level: 1,
      name: "Your everyday, over time.",
    });
  }

  async open(): Promise<void> {
    await this.page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Insights", exact: true })
      .click();
    await this.heading.waitFor();
    await this.periodField.waitFor();
  }

  async goto(): Promise<void> {
    await this.page.goto("/insights");
    await this.heading.waitFor();
    await this.periodField.waitFor();
  }

  get periodField(): Locator {
    return this.page.getByRole("combobox", { name: "Explore a period" });
  }

  get fromField(): Locator {
    return this.page.getByRole("textbox", { name: "From", exact: true });
  }

  get toField(): Locator {
    return this.page.getByRole("textbox", { name: "To", exact: true });
  }

  /** The recorded days, the share of days, and the activities of the period. */
  get summary(): Locator {
    return this.page.getByRole("group", { name: "Selected period summary" });
  }

  get emptyHistory(): Locator {
    return this.page.getByRole("heading", {
      level: 2,
      name: "Your patterns start with a day",
    });
  }

  get emptyPeriod(): Locator {
    return this.page.getByRole("heading", {
      level: 2,
      name: "No entries in this period",
    });
  }

  get invalidRange(): Locator {
    return this.page.getByRole("alert").filter({
      hasText: "Choose a valid date range ending today or earlier.",
    });
  }

  /** The link to a section: Activities, Next day, Combinations, Rhythms, or Best weeks. */
  sectionLink(name: string): Locator {
    return this.page
      .getByRole("navigation", { name: "Insight sections" })
      .getByRole("link", { name, exact: true });
  }

  sectionHeading(name: string): Locator {
    return this.page.getByRole("heading", { level: 2, name });
  }

  /** The row of an activity in the ranking. Its name holds the numbers. */
  rankedActivity(name: string): Locator {
    return this.page
      .getByRole("group", { name: "Activity mood associations" })
      .getByRole("button", { name: new RegExp(`^\\d+ ${name} `) });
  }

  /** The row of the activity whose detail shows. It is pressed. */
  pickedActivity(name: string): Locator {
    return this.page
      .getByRole("group", { name: "Activity mood associations" })
      .getByRole("button", {
        name: new RegExp(`^\\d+ ${name} `),
        pressed: true,
      });
  }

  /** The heading of the detail of the chosen activity. */
  activityDetail(name: string): Locator {
    return this.page.getByRole("heading", { level: 3, name, exact: true });
  }

  /** The gap in mood points between the days with and without the activity, such as "+1.83 mood points". */
  get moodGap(): Locator {
    return this.page.getByRole("strong").filter({ hasText: /mood points$/ });
  }

  /** The table of the mood on each weekday. */
  get weekdayTable(): Locator {
    return this.page.getByRole("table", { name: "Mood by weekday" });
  }

  /** The row of a weekday in the table of the mood by weekday, such as "Monday 1 1 5.00". */
  weekdayRow(weekday: string): Locator {
    return this.weekdayTable.getByRole("row", {
      name: new RegExp(`^${weekday} `),
    });
  }

  async choosePeriod(label: string): Promise<void> {
    await this.periodField.selectOption({ label });
  }

  async chooseCustomRange(input: { from: string; to: string }): Promise<void> {
    await this.choosePeriod("Custom dates");
    await this.fromField.fill(input.from);
    await this.toField.fill(input.to);
  }

  async chooseActivity(name: string): Promise<void> {
    await this.rankedActivity(name).click();
  }
}
