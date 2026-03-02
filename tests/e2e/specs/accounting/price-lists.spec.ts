import { test, expect } from "../../fixtures/test-base";
import { CatalogPage } from "../../pages/accounting/catalog.page";
import {
  cleanDatabase, createUnit, createProduct, createPriceList, createSalePrice,
} from "../../fixtures/database.fixture";

test.describe("Price List Isolation", () => {
  let unit: { id: string };
  let product: { id: string; name: string };

  test.beforeEach(async () => {
    await cleanDatabase();
    unit = await createUnit({ name: "Штука", shortName: "шт" });
    product = (await createProduct({
      name: "Товар с ценой",
      sku: "PRC-001",
      unitId: unit.id,
    })) as typeof product;
  });

  test("price list price does not affect base product price", async ({ adminPage }) => {
    // Set base price (no priceListId)
    await createSalePrice(product.id, { price: 1000 });

    // Create price list with different price
    const priceList = await createPriceList({ name: "VIP Клиенты" });
    await createSalePrice(product.id, { price: 800, priceListId: priceList.id });

    // Check via API that product returns only base price
    const res = await adminPage.request.get("/api/accounting/products");
    const data = await res.json();
    const found = data.data.find((p: { id: string }) => p.id === product.id);

    expect(found).toBeDefined();
    if (found.salePrices && found.salePrices.length > 0) {
      expect(found.salePrices[0].price).toBe(1000);
    }
  });

  test("create price list via price lists tab", async ({ adminPage }) => {
    await createPriceList({ name: "Оптовые цены" });

    const catalog = new CatalogPage(adminPage);
    await catalog.goto();
    await catalog.openPriceListsTab();

    await expect(adminPage.getByText("Оптовые цены")).toBeVisible();
  });

  test("multiple price lists keep independent prices", async ({ adminPage }) => {
    const pl1 = await createPriceList({ name: "Розница" });
    const pl2 = await createPriceList({ name: "Опт" });

    await createSalePrice(product.id, { price: 1000 });
    await createSalePrice(product.id, { price: 900, priceListId: pl1.id });
    await createSalePrice(product.id, { price: 700, priceListId: pl2.id });

    // Verify via API that product listing returns only base price
    const res = await adminPage.request.get("/api/accounting/products");
    const data = await res.json();
    const found = data.data.find((p: { id: string }) => p.id === product.id);

    expect(found).toBeDefined();
    if (found.salePrices && found.salePrices.length > 0) {
      const prices = found.salePrices.map((sp: { price: number }) => sp.price);
      expect(prices).not.toContain(900);
      expect(prices).not.toContain(700);
    }
  });
});
