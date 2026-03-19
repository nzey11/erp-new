import { test as base, expect, type Page, type BrowserContext } from "@playwright/test";
import { createAdminSession, createCsrfTokens } from "./auth.fixture";

type TestFixtures = {
  /** A Page already authenticated as admin */
  adminPage: Page;
  /** The browser context for the admin session (for making API calls) */
  adminContext: BrowserContext;
  /** CSRF token for making API requests */
  csrfToken: string;
};

export const test = base.extend<TestFixtures>({
  adminContext: [async ({ browser }, use) => {
    // Create admin session AFTER cleanDatabase is called in test's beforeEach
    const { sessionToken } = await createAdminSession();
    const { rawToken, signedToken } = await createCsrfTokens();

    // Create context with both session and CSRF cookies
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: "session",
        value: sessionToken,
        domain: "localhost",
        path: "/",
      },
      {
        name: "csrf_token",
        value: signedToken,
        domain: "localhost",
        path: "/",
      },
    ]);

    // Store CSRF token in context for later use
    // @ts-expect-error - extending context with custom property
    context._csrfToken = rawToken;

    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(context);

    await context.close();
  }, { auto: false }],

  csrfToken: async ({ adminContext }, use) => {
    // @ts-expect-error - retrieving custom property
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(adminContext._csrfToken as string);
  },

  adminPage: async ({ adminContext, csrfToken }, use) => {
    const page = await adminContext.newPage();

    // Intercept ALL API requests to add CSRF header for mutating operations.
    // Only inject our token if the request doesn't already have one (csrfFetch adds its own).
    await page.route("/api/**", async (route, request) => {
      const method = request.method();
      if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        const existingHeaders = request.headers();
        // Only add token if not already present (csrfFetch handles its own token)
        if (!existingHeaders["x-csrf-token"]) {
          await route.continue({
            headers: { ...existingHeaders, "X-CSRF-Token": csrfToken },
          });
        } else {
          await route.continue();
        }
      } else {
        await route.continue();
      }
    });

    // Log any page errors for debugging
    page.on("pageerror", (err) => {
      console.error("[PAGE ERROR]", err.message);
    });
    page.on("crash", () => {
      console.error("[PAGE CRASH] Page crashed!");
    });
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
  },
});

export { expect };
