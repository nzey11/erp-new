import type { Page } from "@playwright/test";

export class StoreCatalogPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto("/store/catalog");
    await this.page.waitForLoadState("networkidle");
  }

  /** Get the page heading */
  getHeading() {
    return this.page.getByRole("heading", { name: "Каталог товаров" });
  }

  /** Get the product count text */
  getProductCount() {
    return this.page.getByText(/Найдено товаров:/);
  }

  /** Search for a product */
  async search(query: string) {
    await this.page.getByPlaceholder("Поиск товаров...").fill(query);
    await this.page.getByPlaceholder("Поиск товаров...").press("Enter");
    await this.page.waitForLoadState("networkidle");
  }

  /** Click on a product card by name */
  async openProduct(name: string) {
    await this.page.getByText(name, { exact: false }).first().click();
    await this.page.waitForLoadState("networkidle");
  }

  /** Filter by category in sidebar */
  async filterByCategory(name: string) {
    await this.page.getByRole("button", { name }).click();
    await this.page.waitForLoadState("networkidle");
  }

  /** Check if "Товары не найдены" is visible */
  async isEmptyState(): Promise<boolean> {
    return this.page.getByText("Товары не найдены").isVisible();
  }
}
