import { test, expect } from "../../fixtures/test-base";
import { CatalogPage } from "../../pages/accounting/catalog.page";
import {
  createUnit, createProduct, createCategory, findCategoryByName,
} from "../../fixtures/database.fixture";

test.describe("Catalog Management", () => {
  // Note: cleanDatabase is called in worker setup, not here
  // to preserve the admin session created by the fixture

  test("create a new category", async ({ adminPage }) => {
    const catalog = new CatalogPage(adminPage);
    await catalog.goto();

    await catalog.createCategory("Электроника");

    await expect(adminPage.getByText("Электроника")).toBeVisible();

    const category = await findCategoryByName("Электроника");
    expect(category).not.toBeNull();
  });

  test("view products in catalog", async ({ adminPage }) => {
    const unit = await createUnit({ name: "Штука", shortName: "шт" });
    await createProduct({ name: "Тестовый товар", sku: "TST-001", unitId: unit.id });

    const catalog = new CatalogPage(adminPage);
    await catalog.goto();

    await expect(adminPage.getByText("Тестовый товар")).toBeVisible();
    await expect(adminPage.getByText("TST-001")).toBeVisible();
  });

  test("filter products by category", async ({ adminPage }) => {
    const unit = await createUnit({ name: "Штука", shortName: "шт" });
    const catA = await createCategory({ name: "Категория А" });
    const catB = await createCategory({ name: "Категория Б" });
    await createProduct({ name: "Товар из А", sku: "A-001", unitId: unit.id, categoryId: catA.id });
    await createProduct({ name: "Товар из Б", sku: "B-001", unitId: unit.id, categoryId: catB.id });

    const catalog = new CatalogPage(adminPage);
    await catalog.goto();

    await catalog.selectCategory("Категория А");
    await adminPage.waitForTimeout(1000);

    await expect(adminPage.getByText("Товар из А")).toBeVisible();
  });

  test("switch to price lists tab", async ({ adminPage }) => {
    const catalog = new CatalogPage(adminPage);
    await catalog.goto();

    await catalog.openPriceListsTab();

    await expect(adminPage.getByText("Прайс-листы").first()).toBeVisible();
  });
});
