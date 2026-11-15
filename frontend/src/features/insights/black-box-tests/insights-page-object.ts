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

  // Best weeks

  /** A date as the table of weeks writes it, such as "Nov 9, 2026". */
  static rangeDate(iso: string): string {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  /** The figure of a cohort, such as "Higher-mood weeks": the count, then the mean mood. */
  cohortMetric(label: string): Locator {
    return this.page.getByRole("article").filter({ hasText: label });
  }

  /** The table of how often each activity shows in the higher and the typical weeks. */
  get cohortActivityTable(): Locator {
    return this.page.getByRole("table", {
      name: /^Activity frequency comparison/,
    });
  }

  /** The row of an activity in that table, such as "Gym 100% 0% +100 pp". */
  cohortActivityRow(name: string): Locator {
    return this.cohortActivityTable.getByRole("row", {
      name: new RegExp(`^${name} `),
    });
  }

  get qualifyingWeeksTable(): Locator {
    return this.page.getByRole("table", { name: /^Qualifying .* weeks$/ });
  }

  /** The row of a week of the table of qualifying weeks, found by the first day. */
  qualifyingWeek(weekStart: string): Locator {
    return this.qualifyingWeeksTable.getByRole("row", {
      name: new RegExp(`^${InsightsPageObject.rangeDate(weekStart)} – `),
    });
  }

  /** The count above the table of qualifying weeks, such as "2 weeks". */
  qualifyingWeeksCount(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }

  get noQualifyingWeeks(): Locator {
    return this.page.getByText(
      "There are no ended full weeks with enough logged days in this range yet.",
    );
  }

  // Next day and pairs

  get nextDayActivityField(): Locator {
    return this.page.getByRole("combobox", { name: "Activity", exact: true });
  }

  /** The line above the windows, such as "Gym anchor days". */
  anchorDays(activity: string): Locator {
    return this.page.getByText(`${activity} anchor days`, { exact: true });
  }

  /** One window of the next-day section, such as "Next calendar day". */
  calendarWindow(label: string): Locator {
    return this.page.getByRole("article").filter({
      has: this.page.getByRole("heading", {
        level: 3,
        name: label,
        exact: true,
      }),
    });
  }

  /** The mood line of a window, such as "Meh 1 · Rad 1", for one of its two groups. */
  calendarWindowMoods(label: string, moods: string): Locator {
    return this.calendarWindow(label).getByText(moods, { exact: true });
  }

  get firstPairField(): Locator {
    return this.page.getByRole("combobox", { name: "First activity" });
  }

  get secondPairField(): Locator {
    return this.page.getByRole("combobox", { name: "Second activity" });
  }

  get noPairSuggestions(): Locator {
    return this.page.getByText("No pair meets the 10-observation threshold", {
      exact: false,
    });
  }

  /** The heading of the pair that shows, such as "Gym + Cook". */
  pairDetail(label: string): Locator {
    return this.page.getByRole("heading", {
      level: 3,
      name: label,
      exact: true,
    });
  }

  /** The mark of a pair that has groups with too few days, such as "Sparse: 4 groups". */
  sparsePair(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }

  /** The card of one of the four groups of a pair, such as "Gym only". */
  pairGroup(title: string): Locator {
    return this.page.getByRole("heading", {
      level: 4,
      name: title,
      exact: true,
    });
  }

  /** The note under a sparse pair, which lists the days of each group. */
  sparseNote(text: string): Locator {
    return this.page.getByText(text);
  }

  /**
   * Pick both activities of a pair. Each list leaves out the activity of the
   * other one, so the first pick must not be the activity that the second
   * list holds now.
   */
  async choosePair(input: { first: string; second: string }): Promise<void> {
    await this.firstPairField.selectOption({ label: input.first });
    await this.secondPairField.selectOption({ label: input.second });
  }

  async chooseNextDayActivity(name: string): Promise<void> {
    await this.nextDayActivityField.selectOption({ label: name });
  }
}
