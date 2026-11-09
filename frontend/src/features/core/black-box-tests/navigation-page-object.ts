import type { Locator, Page } from "@playwright/test";

/** The header and the bottom navigation that every page of the journal shows. */
export class NavigationPageObject {
  constructor(private readonly page: Page) {}

  /** The button of a page in the bottom navigation. */
  button(name: "Log" | "Calendar" | "Insights" | "Setup"): Locator {
    return this.page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name, exact: true });
  }

  get skipLink(): Locator {
    return this.page.getByRole("link", { name: "Skip to content" });
  }

  /** The text of the page that shows when an address has no page. */
  get notFound(): Locator {
    return this.page.getByText("This page could not be found.");
  }

  async goBack(): Promise<void> {
    await this.page.goBack();
  }

  async goForward(): Promise<void> {
    await this.page.goForward();
  }

  get brandButton(): Locator {
    return this.page.getByRole("button", { name: "Go to log" });
  }

  /** The state of the connection: online, offline, checking, or sync issue. */
  get connection(): Locator {
    return this.page.getByRole("status", { name: /^Connection: / });
  }

  /** The title in the header of a page that is not the log. */
  title(text: string): Locator {
    return this.page.getByRole("banner").getByText(text, { exact: true });
  }
}
