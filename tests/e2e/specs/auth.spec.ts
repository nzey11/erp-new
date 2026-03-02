import { test, expect } from "../fixtures/test-base";
import { LoginPage } from "../pages/common/login.page";
import { hash } from "bcryptjs";
import { cleanDatabase, createUser } from "../fixtures/database.fixture";

test.describe("Authentication", () => {
  test.beforeEach(async () => {
    await cleanDatabase();
  });

  test("successful admin login redirects to catalog", async ({ page }) => {
    const passwordHash = await hash("admin123", 10);
    await createUser({ username: "admin", password: passwordHash, role: "admin" });

    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login("admin", "admin123");
    await loginPage.waitForRedirect();
    expect(page.url()).not.toContain("/login");
  });

  test("failed login shows error message", async ({ page }) => {
    const passwordHash = await hash("admin123", 10);
    await createUser({ username: "admin", password: passwordHash, role: "admin" });

    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login("admin", "wrongpassword");

    await expect(loginPage.getErrorMessage()).toBeVisible();
    expect(page.url()).toContain("/login");
  });

  test("unauthenticated user is redirected to login", async ({ page }) => {
    await page.goto("/catalog");
    await page.waitForURL("**/login**");
    expect(page.url()).toContain("/login");
  });

  test("admin session cookie grants access", async ({ adminPage }) => {
    await adminPage.goto("/catalog");
    await adminPage.waitForLoadState("networkidle");
    expect(adminPage.url()).toContain("/catalog");
  });
});
