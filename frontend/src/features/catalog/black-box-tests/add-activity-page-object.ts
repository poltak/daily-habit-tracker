import type { Locator, Page } from "@playwright/test";

/** The form that adds one activity to a group. */
export class AddActivityPageObject {
  constructor(private readonly page: Page) {}

  get heading(): Locator {
    return this.page.getByRole("heading", {
      level: 1,
      name: "Add new activity",
    });
  }

  get nameField(): Locator {
    return this.page.getByRole("textbox", { name: "Name" });
  }

  get groupField(): Locator {
    return this.page.getByRole("combobox", { name: "Activity group" });
  }

  get iconButton(): Locator {
    return this.page.getByRole("button", { name: "Choose activity icon" });
  }

  get addButton(): Locator {
    return this.page.getByRole("button", { name: "Add activity", exact: true });
  }

  get cancelButton(): Locator {
    return this.page.getByRole("button", { name: "Cancel" });
  }

  /** The button back to the page that opened the form: "Log" or "Setup". */
  backButton(page: "Log" | "Setup"): Locator {
    return this.page
      .getByRole("main")
      .getByRole("button", { name: page, exact: true });
  }

  /** A message above the form, such as "Activity name is required.". */
  notice(text: string): Locator {
    return this.page.getByRole("status").filter({ hasText: text });
  }

  async fillName(name: string): Promise<void> {
    await this.nameField.fill(name);
  }

  async chooseGroup(name: string): Promise<void> {
    await this.groupField.selectOption({ label: name });
  }

  /** Add the activity, and wait until the form closes. */
  async add(input: { name: string; group?: string }): Promise<void> {
    await this.fillName(input.name);
    if (input.group) {
      await this.chooseGroup(input.group);
    }
    await this.addButton.click();
    await this.heading.waitFor({ state: "hidden" });
  }

  /** Press Add, and stay on the form. For a name that the app refuses. */
  async tryAdd(name: string): Promise<void> {
    await this.fillName(name);
    await this.addButton.click();
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
    await this.heading.waitFor({ state: "hidden" });
  }
}
