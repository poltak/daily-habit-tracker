import type { Locator, Page } from "@playwright/test";

/** The page that a visitor without a session sees: set up the first passkey, or sign in. */
export class PasskeySignInPageObject {
  constructor(private readonly page: Page) {}

  get setUpHeading(): Locator {
    return this.page.getByRole("heading", { level: 1, name: "Set up daymark" });
  }

  get signInHeading(): Locator {
    return this.page.getByRole("heading", {
      level: 1,
      name: "Sign in to daymark",
    });
  }

  /** The heading of the form that adds a passkey to a daymark that has one. */
  get addPasskeyHeading(): Locator {
    return this.page.getByRole("heading", { level: 1, name: "Add a passkey" });
  }

  get setupCodeField(): Locator {
    return this.page.getByLabel("Setup code");
  }

  get createPasskeyButton(): Locator {
    return this.page.getByRole("button", { name: "Create passkey" });
  }

  get signInButton(): Locator {
    return this.page.getByRole("button", { name: "Sign in with passkey" });
  }

  get recoverButton(): Locator {
    return this.page.getByRole("button", {
      name: "Lost your passkey? Use your setup code",
    });
  }

  get backToSignInButton(): Locator {
    return this.page.getByRole("button", { name: "Back to sign-in" });
  }

  /** The message of a refusal, such as "This setup code is not correct.". */
  error(text: string): Locator {
    return this.page.getByRole("alert").filter({ hasText: text });
  }

  /** Open a page of the journal. A visitor lands on this page instead. */
  async goto(path = "/"): Promise<void> {
    await this.page.goto(path);
  }

  /** Save the first passkey with the setup code, and wait until the journal opens. */
  async setUp(setupCode: string): Promise<void> {
    await this.submitSetupCode(setupCode);
    await this.setUpHeading.waitFor({ state: "hidden" });
  }

  /** Type a setup code and ask for a passkey. The page stays on a refusal. */
  async submitSetupCode(setupCode: string): Promise<void> {
    await this.setupCodeField.waitFor();
    await this.setupCodeField.fill(setupCode);
    await this.createPasskeyButton.click();
  }

  /** On the sign-in page, add a passkey for this device with the setup code. */
  async recover(setupCode: string): Promise<void> {
    await this.openRecovery();
    await this.setupCodeField.fill(setupCode);
    await this.createPasskeyButton.click();
    await this.addPasskeyHeading.waitFor({ state: "hidden" });
  }

  async openRecovery(): Promise<void> {
    await this.signInHeading.waitFor();
    await this.recoverButton.click();
    await this.addPasskeyHeading.waitFor();
  }

  async signIn(): Promise<void> {
    await this.signInHeading.waitFor();
    await this.signInButton.click();
    await this.signInHeading.waitFor({ state: "hidden" });
  }
}
