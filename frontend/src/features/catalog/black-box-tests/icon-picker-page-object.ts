import type { Locator, Page } from "@playwright/test";

/** The dialog where the owner picks an icon for an activity or a goal. */
export class IconPickerPageObject {
  constructor(private readonly page: Page) {}

  get dialog(): Locator {
    return this.page.getByRole("dialog", { name: "Choose an icon" });
  }

  /** "Activity icon" or "Goal icon". */
  kind(text: string): Locator {
    return this.dialog.getByText(text, { exact: true });
  }

  /** The name of the item, such as "For Gym". */
  subject(text: string): Locator {
    return this.dialog.getByText(text, { exact: true });
  }

  get searchField(): Locator {
    return this.dialog.getByRole("textbox", { name: "Search icons" });
  }

  get closeButton(): Locator {
    return this.dialog.getByRole("button", { name: "Close icon picker" });
  }

  category(name: string): Locator {
    return this.dialog
      .getByRole("toolbar", { name: "Icon categories" })
      .getByRole("button", { name, exact: true });
  }

  /** The button of an icon, such as "directions run". */
  icon(name: string): Locator {
    return this.dialog.getByRole("button", {
      name: `Use ${name} icon`,
      exact: true,
    });
  }

  /** The button of the icon that the item has now. It shows as pressed. */
  chosenIcon(name: string): Locator {
    return this.dialog.getByRole("button", {
      name: `Use ${name} icon`,
      exact: true,
      pressed: true,
    });
  }

  /** The count line, such as "Showing 120 of 3901 icons". */
  count(text: string | RegExp): Locator {
    return this.dialog.getByText(text);
  }

  get showMoreButton(): Locator {
    return this.dialog.getByRole("button", { name: "Show more icons" });
  }

  get noMatches(): Locator {
    return this.dialog.getByText("No icons match that search.");
  }

  async search(query: string): Promise<void> {
    await this.searchField.fill(query);
  }

  async chooseCategory(name: string): Promise<void> {
    await this.category(name).click();
  }

  /** Pick an icon. The dialog closes after the icon is taken. */
  async choose(name: string): Promise<void> {
    await this.icon(name).click();
    await this.dialog.waitFor({ state: "hidden" });
  }

  async close(): Promise<void> {
    await this.closeButton.click();
    await this.dialog.waitFor({ state: "hidden" });
  }

  async closeWithEscape(): Promise<void> {
    await this.page.keyboard.press("Escape");
    await this.dialog.waitFor({ state: "hidden" });
  }
}
