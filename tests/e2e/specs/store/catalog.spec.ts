import { test, expect } from "../../fixtures/test-base";
import { StoreCatalogPage } from "../../pages/store/catalog.page";
import {
  cleanDatabase, createUnit, createProduct, createCategory, createSalePrice,
} from "../../fixtures/database.fixture";

test.describe("Store Catalog (Public)", () => {
  test.beforeEach(async () => {
    await cleanDatabase();
  });

  test("displays products in the store catalog", async ({ page }) => {
    const unit = await createUnit({ name: "Штука", shortName: "шт" });
    const p1 = await createProduct({ name: "Ноутбук Dell", sku: "NB-001", unitId: unit.id, publishedToStore: true });
    const p2 = await createProduct({ name: "Мышь Logitech", sku: "MS-001", unitId: unit.id, publishedToStore: true });
    await createSalePrice(p1.id, { price: 50000 });
    await createSalePrice(p2.id, { price: 3000 });

    const storeCatalog = new StoreCatalogPage(page);
    await storeCatalog.goto();

    await expect(page.getByText("Ноутбук Dell")).toBeVisible();
    await expect(page.getByText("Мышь Logitech")).toBeVisible();
  });

  test("search filters products", async ({ page }) => {
    const unit = await createUnit({ name: "Штука", shortName: "шт" });
    const p1 = await createProduct({ name: "Ноутбук Dell", sku: "NB-001", unitId: unit.id, publishedToStore: true });
    const p2 = await createProduct({ name: "Клавиатура", sku: "KB-001", unitId: unit.id, publishedToStore: true });
    await createSalePrice(p1.id, { price: 50000 });
    await createSalePrice(p2.id, { price: 3000 });

    const storeCatalog = new StoreCatalogPage(page);
    await storeCatalog.goto();
    await storeCatalog.search("Ноутбук");

    await expect(page.getByText("Ноутбук Dell")).toBeVisible();
  });

  test("shows empty state when no products", async ({ page }) => {
    const storeCatalog = new StoreCatalogPage(page);
    await storeCatalog.goto();

    await expect(page.getByText("Товары не найдены")).toBeVisible();
  });

  test("filter by category", async ({ page }) => {
    const unit = await createUnit({ name: "Штука", shortName: "шт" });
    const catA = await createCategory({ name: "Электроника" });
    const catB = await createCategory({ name: "Одежда" });
    const p1 = await createProduct({ name: "Смартфон", sku: "PH-001", unitId: unit.id, categoryId: catA.id, publishedToStore: true });
    const p2 = await createProduct({ name: "Футболка", sku: "TS-001", unitId: unit.id, categoryId: catB.id, publishedToStore: true });
    await createSalePrice(p1.id, { price: 30000 });
    await createSalePrice(p2.id, { price: 2000 });

    const storeCatalog = new StoreCatalogPage(page);
    await storeCatalog.goto();
    await storeCatalog.filterByCategory("Электроника");

    await expect(page.getByText("Смартфон")).toBeVisible();
  });
});
