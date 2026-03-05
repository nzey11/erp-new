import type { Page, Locator } from "@playwright/test";

export class DocumentsPage {
  constructor(private page: Page) {}

  async goto() {
    // Note: /documents redirects to /purchases in middleware
    await this.page.goto("/purchases");
    await this.page.waitForLoadState("domcontentloaded");
  }

  /** Click "+ Новый документ" button */
  async openCreateDialog() {
    await this.page.getByRole("button", { name: "Новый документ" }).click();
    // Wait for dialog to appear
    await this.page.locator('[role="dialog"]').waitFor({ state: "visible" });
    await this.page.waitForTimeout(500);
  }

  /** Select a document type in the create dialog */
  async selectDocumentType(label: string) {
    const trigger = this.page.locator('[data-testid="doc-type-select"]');
    await trigger.waitFor({ state: "visible" });
    await trigger.click();
    await this.page.waitForTimeout(500);
    await this.page.locator('[role="listbox"]').getByText(label, { exact: true }).click();
    await this.page.waitForTimeout(300);
  }

  /** Select a warehouse in the create dialog */
  async selectWarehouse(name: string) {
    await this.page.locator('[role="dialog"]').getByText("Выберите склад").first().click();
    await this.page.getByRole("option", { name }).click();
    await this.page.waitForTimeout(300);
  }

  /** Select a target warehouse for stock transfers */
  async selectTargetWarehouse(name: string) {
    await this.page.locator('[role="dialog"]').getByText("Выберите склад").last().click();
    await this.page.getByRole("option", { name }).click();
    await this.page.waitForTimeout(300);
  }

  /** Select a counterparty in the create dialog */
  async selectCounterparty(name: string) {
    await this.page.locator('[role="dialog"]').getByText("Выберите контрагента").click();
    await this.page.getByRole("option", { name }).click();
    await this.page.waitForTimeout(300);
  }

  /** Click the "Создать" button in the create dialog */
  async submitCreate() {
    await this.page.getByRole("button", { name: "Создать", exact: true }).click();
    await this.page.waitForTimeout(500);
  }

  /** Get the documents table */
  getDocumentsTable(): Locator {
    return this.page.locator("table");
  }

  /** Filter documents by tab */
  async filterByTab(tabName: string) {
    await this.page.getByRole("tab", { name: tabName }).click();
  }
}

export class DocumentDetailPage {
  constructor(private page: Page) {}

  async goto(id: string) {
    await this.page.goto(`/documents/${id}`);
    await this.page.waitForLoadState("domcontentloaded");
  }

  /** Click "Добавить позицию" button */
  async openAddItemDialog() {
    await this.page.getByRole("button", { name: "Добавить позицию" }).click();
    await this.page.waitForTimeout(300);
  }

  /** Select a product in the add-item dialog (search input + Select) */
  async selectProduct(name: string) {
    const dialog = this.page.locator('[role="dialog"]');
    // Type in search input to filter products
    await dialog.locator('input[placeholder="Поиск товара..."]').fill(name);
    // Wait for debounce (300ms) + network
    await this.page.waitForTimeout(600);
    // Open the Select dropdown
    await dialog.locator('[role="combobox"]').click();
    await this.page.getByRole("option", { name }).click();
    await this.page.waitForTimeout(300);
  }

  /** Fill the quantity field in add-item dialog */
  async fillQuantity(qty: string) {
    await this.page.locator('[role="dialog"]').locator('input[type="number"]').first().fill(qty);
  }

  /** Fill the price field in add-item dialog */
  async fillPrice(price: string) {
    await this.page.locator('[role="dialog"]').locator('input[type="number"]').last().fill(price);
  }

  /** Submit the add-item dialog */
  async submitAddItem() {
    await this.page.locator('[role="dialog"]').getByRole("button", { name: "Добавить" }).click();
    await this.page.waitForTimeout(500);
  }

  /** Click the "Подтвердить" button */
  async confirmDocument() {
    await this.page.getByRole("button", { name: "Подтвердить" }).click();
    await this.page.waitForTimeout(1000);
  }

  /** Click the "Удалить" button and accept confirm dialog */
  async deleteDocument() {
    this.page.on("dialog", (dialog) => dialog.accept());
    await this.page.getByRole("button", { name: "Удалить" }).click();
    await this.page.waitForTimeout(500);
  }

  /** Get the status badge text */
  getStatusBadge(): Locator {
    return this.page.locator('[class*="badge"]').first();
  }

  /** Get document items table */
  getItemsTable(): Locator {
    return this.page.locator("table");
  }

  /** Get the total amount displayed */
  getTotalAmount(): Locator {
    return this.page.locator(".text-xl.font-bold");
  }
}
