import type { Locator, Page } from "@playwright/test";

/** The insights page: the summary of a period and its four sections. */
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

  /** The good days, the average mood and the recorded days of the period. */
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

  sectionHeading(name: string): Locator {
    return this.page.getByRole("heading", { level: 2, name });
  }

  get monthTable(): Locator {
    return this.page.getByRole("table", { name: "Good-day share by month" });
  }

  /** The cell of a month, such as `Nov` of `2026`. Its text is the share. */
  monthCell({ month, year }: { month: string; year: string }): Locator {
    return this.monthTable.getByTitle(new RegExp(`^${month} ${year}: `));
  }

  /** The list of a block of the better and worse days: "What you do" or "How you felt". */
  moodLinks(title: string): Locator {
    return this.page.getByRole("list", { name: title, exact: true });
  }

  /** The rows of a list of the better and worse days, best first. */
  moodLinkItems(title: string): Locator {
    return this.moodLinks(title).getByRole("listitem");
  }

  get recentShortPeriod(): Locator {
    return this.page.getByText(
      "Choose a period longer than 120 days to compare your last 90 days with the time before.",
    );
  }

  get weekdays(): Locator {
    return this.page.getByRole("list", { name: "Good days by weekday" });
  }

  /** The row of a weekday, such as "Monday". */
  weekdayItem(weekday: string): Locator {
    return this.weekdays.getByRole("listitem", { name: weekday });
  }

  get weekdayItems(): Locator {
    return this.weekdays.getByRole("listitem");
  }

  async choosePeriod(label: string): Promise<void> {
    await this.periodField.selectOption({ label });
  }

  async chooseCustomRange(input: { from: string; to: string }): Promise<void> {
    await this.choosePeriod("Custom dates");
    await this.fromField.fill(input.from);
    await this.toField.fill(input.to);
  }
}
