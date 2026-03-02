import { test as base, expect, type Page } from "@playwright/test";
import { createAdminSession } from "./auth.fixture";

type TestFixtures = {
  /** A Page already authenticated as admin */
  adminPage: Page;
};

export const test = base.extend<TestFixtures>({
  adminPage: async ({ browser }, use) => {
    // Create admin session (specs must call cleanDatabase() in their own beforeEach BEFORE this runs)
    const { sessionToken } = await createAdminSession();

    // Create context with session cookie
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: "session",
        value: sessionToken,
        domain: "localhost",
        path: "/",
      },
    ]);

    const page = await context.newPage();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);

    await context.close();
  },
});

export { expect };
