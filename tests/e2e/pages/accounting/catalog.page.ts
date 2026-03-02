import type { Page, Locator } from "@playwright/test";

export class CatalogPage {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto("/catalog");
    await this.page.waitForLoadState("networkidle");
  }

  /** Click "Все товары" to reset category filter */
  async selectAllProducts() {
    await this.page.getByText("Все товары").first().click();
  }

  /** Click on a category by name in the tree (left panel) */
  async selectCategory(name: string) {
    // The category tree is in the left panel, category names are in span.truncate
    const categoryItem = this.page.locator('.truncate').filter({ hasText: name }).first();
    await categoryItem.waitFor({ state: "visible" });
    await categoryItem.click();
  }

  /** Open the create-category dialog */
  async openCreateCategoryDialog() {
    await this.page.getByTitle("Добавить категорию").click();
  }

  /** Fill and save a new category */
  async createCategory(name: string) {
    await this.openCreateCategoryDialog();
    // Label has no htmlFor, so use dialog input directly
    await this.page.locator('[role="dialog"] input').first().fill(name);
    await this.page.getByRole("button", { name: "Сохранить" }).click();
    await this.page.waitForTimeout(500);
  }

  /** Switch to the "Прайс-листы" tab */
  async openPriceListsTab() {
    await this.page.getByRole("tab", { name: "Прайс-листы" }).click();
  }

  /** Switch to the "Товары" tab */
  async openProductsTab() {
    await this.page.getByRole("tab", { name: "Товары" }).click();
  }

  /** Get the products table */
  getProductsTable(): Locator {
    return this.page.locator("table");
  }

  /** Check if a product name is visible in the table */
  async isProductVisible(name: string): Promise<boolean> {
    return this.page.getByRole("cell", { name }).isVisible();
  }
}
