import type { Locator, Page } from "@playwright/test";

const CONTROL_ATTEMPTS = 20;

/** The service worker and the connection of the browser. */
export class OfflineShellPageObject {
  constructor(private readonly page: Page) {}

  /**
   * Reload until the service worker answers the page. Only a worker that has
   * cached the app shell and taken control answers a navigation, so then an
   * offline reload works.
   */
  async waitForControl(): Promise<void> {
    const context = this.page.context();
    if (context.serviceWorkers().length === 0) {
      await context.waitForEvent("serviceworker");
    }
    for (let attempt = 1; attempt <= CONTROL_ATTEMPTS; attempt += 1) {
      const response = await this.page.reload();
      if (response?.fromServiceWorker()) {
        return;
      }
    }
    throw new Error("The service worker did not take control of the page.");
  }

  /**
   * The page of the app that shows when the session check cannot reach the
   * server. A browser error page has no such heading, so it shows that the
   * worker answered with the app shell.
   */
  get sessionCheckFailure(): Locator {
    return this.page.getByRole("heading", {
      level: 1,
      name: "Unable to check your session",
    });
  }

  async goOffline(): Promise<void> {
    await this.page.context().setOffline(true);
  }

  async reload(): Promise<void> {
    await this.page.reload();
  }
}
