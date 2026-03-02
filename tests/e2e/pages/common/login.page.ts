import type { Page } from "@playwright/test";

export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto("/login");
  }

  async login(username: string, password: string) {
    await this.page.fill("#username", username);
    await this.page.fill("#password", password);
    await this.page.click('button[type="submit"]');
  }

  async waitForRedirect() {
    await this.page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 15_000,
    });
  }

  getErrorMessage() {
    return this.page.locator(".text-destructive");
  }

  getSubmitButton() {
    return this.page.locator('button[type="submit"]');
  }
}
