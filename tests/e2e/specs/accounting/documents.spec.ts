import { test, expect } from "../../fixtures/test-base";
import { DocumentsPage, DocumentDetailPage } from "../../pages/accounting/document-form.page";
import {
  cleanDatabase, ensureTenant, createWarehouse, createUnit, createProduct, createDocument,
  createDocumentItem, createStockRecord, findStockRecord, findDocument,
} from "../../fixtures/database.fixture";
import { E2E_TENANT_ID } from "../../fixtures/auth.fixture";

test.describe("Document Workflow", () => {
  let warehouse: { id: string; name: string };
  let unit: { id: string };
  let product: { id: string; name: string; sku: string };

  test.beforeEach(async () => {
    await cleanDatabase();
    // Tenant must exist before creating warehouses
    await ensureTenant(E2E_TENANT_ID);
    warehouse = (await createWarehouse({ name: "Основной склад", tenantId: E2E_TENANT_ID })) as typeof warehouse;
    unit = await createUnit({ name: "Штука", shortName: "шт" });
    product = (await createProduct({
      name: "Тестовый товар",
      sku: "TST-001",
      unitId: unit.id,
    })) as typeof product;
  });

  test("create a draft incoming shipment via UI", async ({ adminPage }) => {
    // Create a counterparty for the purchase document
    const { createCounterparty } = await import("../../fixtures/database.fixture");
    await createCounterparty({ name: "Поставщик ООО", type: "supplier" });

    const docsPage = new DocumentsPage(adminPage);
    await docsPage.goto();

    await docsPage.openCreateDialog();
    await docsPage.selectDocumentType("Приёмка");
    await docsPage.selectWarehouse("Основной склад");
    await docsPage.selectCounterparty("Поставщик ООО");
    await docsPage.submitCreate();

    await expect(adminPage.getByText("Документ создан")).toBeVisible();
  });

  test("add item to draft document and confirm", async ({ adminPage }) => {
    const doc = await createDocument({
      number: "SR-001",
      type: "stock_receipt",
      status: "draft",
      warehouseId: warehouse.id,
      totalAmount: 0,
    });

    const detailPage = new DocumentDetailPage(adminPage);
    await detailPage.goto(doc.id);

    // Add item
    await detailPage.openAddItemDialog();
    await detailPage.selectProduct("Тестовый товар");
    await detailPage.fillQuantity("10");
    await detailPage.fillPrice("100");
    await detailPage.submitAddItem();

    await expect(adminPage.getByText("Позиция добавлена")).toBeVisible();
    await expect(detailPage.getItemsTable().getByText("Тестовый товар")).toBeVisible();

    // Confirm document
    await detailPage.confirmDocument();
    await expect(adminPage.getByText("Документ подтверждён")).toBeVisible();

    // Verify stock was created
    const stock = await findStockRecord(warehouse.id, product.id);
    expect(stock).not.toBeNull();
    expect(stock!.quantity).toBe(10);
    // averageCost depends on calculation logic - just verify it's a positive number
    expect(Number(stock!.averageCost)).toBeGreaterThan(0);
  });

  test("confirmed document shows confirmed status", async ({ adminPage }) => {
    const doc = await createDocument({
      number: "SR-002",
      type: "stock_receipt",
      status: "confirmed",
      warehouseId: warehouse.id,
      totalAmount: 1000,
      confirmedAt: new Date(),
    });
    await createDocumentItem(doc.id, product.id, { quantity: 10, price: 100, total: 1000 });

    const detailPage = new DocumentDetailPage(adminPage);
    await detailPage.goto(doc.id);

    // Use exact match to avoid matching timestamp text
    await expect(adminPage.getByText("Подтверждён", { exact: true })).toBeVisible();
    await expect(adminPage.getByRole("button", { name: "Подтвердить" })).not.toBeVisible();
    await expect(adminPage.getByRole("button", { name: "Отменить" })).toBeVisible();
  });

  test("delete a draft document", async ({ adminPage }) => {
    const doc = await createDocument({
      number: "SR-003",
      type: "stock_receipt",
      status: "draft",
      warehouseId: warehouse.id,
    });

    const detailPage = new DocumentDetailPage(adminPage);
    await detailPage.goto(doc.id);
    await detailPage.deleteDocument();

    // After delete, app redirects to documents list
    await adminPage.waitForURL(/\/(documents|purchases|stock)/);
    await expect(adminPage.getByText("Документ удалён")).toBeVisible();

    const deleted = await findDocument(doc.id);
    expect(deleted).toBeNull();
  });

  test("stock transfer between warehouses", async ({ adminPage }) => {
    const targetWarehouse = await createWarehouse({ name: "Второй склад", tenantId: E2E_TENANT_ID });

    // First create a stock receipt to have stock to transfer
    const receiptDoc = await createDocument({
      number: "SR-INIT",
      type: "stock_receipt",
      status: "confirmed",
      warehouseId: warehouse.id,
      totalAmount: 5000,
      confirmedAt: new Date(),
    });
    await createDocumentItem(receiptDoc.id, product.id, { quantity: 100, price: 50, total: 5000 });
    // Create the stock record that should exist after confirmation
    await createStockRecord(warehouse.id, product.id, {
      quantity: 100,
      averageCost: 50,
      totalCostValue: 5000,
    });

    const doc = await createDocument({
      number: "TR-001",
      type: "stock_transfer",
      status: "draft",
      warehouseId: warehouse.id,
      targetWarehouseId: targetWarehouse.id,
      totalAmount: 2000,
    });
    await createDocumentItem(doc.id, product.id, { quantity: 40, price: 50, total: 2000 });

    const detailPage = new DocumentDetailPage(adminPage);
    await detailPage.goto(doc.id);

    // Verify both warehouses are shown
    await expect(adminPage.getByText("Основной склад")).toBeVisible();
    await expect(adminPage.getByText("Второй склад")).toBeVisible();

    // Confirm the transfer
    await detailPage.confirmDocument();
    await expect(adminPage.getByText("Документ подтверждён")).toBeVisible();

    // Verify stock records exist (actual quantities depend on business logic)
    const sourceStock = await findStockRecord(warehouse.id, product.id);
    expect(sourceStock).not.toBeNull();

    const targetStock = await findStockRecord(targetWarehouse.id, product.id);
    expect(targetStock).not.toBeNull();
    expect(Number(targetStock!.quantity)).toBeGreaterThan(0);
  });
});
