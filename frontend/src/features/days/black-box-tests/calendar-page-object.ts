import type { Locator, Page } from "@playwright/test";
import { LogPageObject } from "./log-page-object.js";

/** The calendar: one month of days, each with the mood of its entry. */
export class CalendarPageObject {
  constructor(private readonly page: Page) {}

  get heading(): Locator {
    return this.page.getByRole("heading", { level: 1, name: "Calendar" });
  }

  /** The month and year, such as "November 2026". */
  get monthHeading(): Locator {
    return this.page.getByRole("heading", { level: 2 }).first();
  }

  get previousMonthButton(): Locator {
    return this.page.getByRole("button", { name: "Previous month" });
  }

  get nextMonthButton(): Locator {
    return this.page.getByRole("button", { name: "Next month" });
  }

  /** The button of a day. Its name tells the mood, or that the day is empty. */
  day(iso: string): Locator {
    return this.page.getByRole("button", {
      name: new RegExp(`^${LogPageObject.friendlyDate(iso)},`),
    });
  }

  /** The button of a day that the owner can open. A day that has not started has none. */
  openableDay(iso: string): Locator {
    return this.page.getByRole("button", {
      name: new RegExp(`^${LogPageObject.friendlyDate(iso)},`),
      disabled: false,
    });
  }

  async open(): Promise<void> {
    await this.page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Calendar", exact: true })
      .click();
    await this.heading.waitFor();
  }

  async showPreviousMonth(): Promise<void> {
    const before = await this.monthHeading.innerText();
    await this.previousMonthButton.click();
    await this.page
      .getByRole("heading", { level: 2 })
      .filter({ hasNotText: before })
      .first()
      .waitFor();
  }

  /** Open the log of a day. The log waits for its day to load. */
  async openDay(iso: string): Promise<void> {
    await this.day(iso).click();
    await this.heading.waitFor({ state: "hidden" });
    await new LogPageObject(this.page).waitForDay(iso);
  }
}
