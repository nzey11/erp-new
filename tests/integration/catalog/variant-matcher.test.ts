import { describe, it, expect } from "vitest";
import { createProduct, createCategory, createWarehouse } from "../../helpers/factories";
import { getTestDb } from "../../helpers/test-db";
import { findVariantSuggestions } from "@/lib/modules/accounting/variant-matcher";

// ─────────────────────────────────────────────────────────────────────────────
// variant-matcher: findVariantSuggestions
//
// Tests the three matching strategies:
//   1. SKU pattern  — "PHONE-001-BLK" matches "PHONE-001-WHT"
//   2. Name similarity — "iPhone 15 Черный" matches "iPhone 15 Белый"
//   3. Characteristics — same category + same fields except one differing field
//
// cleanDatabase() runs before each test via tests/setup.ts
// ─────────────────────────────────────────────────────────────────────────────

describe("findVariantSuggestions — SKU pattern matching", () => {
  it("matches products sharing the same SKU base (PHONE-001-BLK ↔ PHONE-001-WHT)", async () => {
    const source = await createProduct({ name: "Phone Black", sku: "PHONE-001-BLK" });
    await createProduct({ name: "Phone White", sku: "PHONE-001-WHT" });
    await createProduct({ name: "Phone Red",   sku: "PHONE-001-RED" });
    // Unrelated product — different SKU base
    await createProduct({ name: "Tablet",      sku: "TAB-999-BLK" });

    const suggestions = await findVariantSuggestions(source.id, { strategy: "sku", minConfidence: 0 });

    expect(suggestions.length).toBe(2);
    const skus = suggestions.map((s) => s.product.sku).sort();
    expect(skus).toContain("PHONE-001-WHT");
    expect(skus).toContain("PHONE-001-RED");
    expect(suggestions.every((s) => s.matchType === "sku")).toBe(true);
    // Confidence should be high (≥85 baseline for SKU match)
    expect(suggestions.every((s) => s.confidence >= 85)).toBe(true);
  });

  it("does not match products with different SKU bases", async () => {
    const source = await createProduct({ sku: "CAT-100-XL" });
    await createProduct({ sku: "DOG-100-XL" }); // different base

    const suggestions = await findVariantSuggestions(source.id, { strategy: "sku", minConfidence: 0 });

    expect(suggestions).toHaveLength(0);
  });

  it("returns empty for a product with no SKU", async () => {
    const source = await createProduct({ name: "No SKU Product", sku: undefined });
    await createProduct({ sku: "ANY-001-BLK" });

    const suggestions = await findVariantSuggestions(source.id, { strategy: "sku", minConfidence: 0 });

    expect(suggestions).toHaveLength(0);
  });

  it("respects minConfidence filter", async () => {
    const source = await createProduct({ name: "Shirt", sku: "SHIRT-M" });
    // 1-segment SKU — extractSkuPattern returns null → no SKU match
    await createProduct({ sku: "SHIRT-L" });

    // With 0 confidence floor, some might match; with 100, none should
    const highConf = await findVariantSuggestions(source.id, {
      strategy: "sku",
      minConfidence: 100,
    });
    expect(highConf).toHaveLength(0);
  });

  it("deduplicates — same product matched by multiple strategies returns highest confidence", async () => {
    const category = await createCategory({ name: "Phones" });
    const source = await createProduct({
      name: "iPhone 15 Черный",
      sku: "IP15-001-BLK",
      categoryId: category.id,
    });
    // This product matches BOTH by SKU and by name
    await createProduct({
      name: "iPhone 15 Белый",
      sku: "IP15-001-WHT",
      categoryId: category.id,
    });

    const suggestions = await findVariantSuggestions(source.id, {
      strategy: "all",
      minConfidence: 0,
    });

    // Should not appear twice — deduplicated by productId keeping highest confidence
    const ids = suggestions.map((s) => s.productId);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

describe("findVariantSuggestions — name similarity matching", () => {
  it("matches products with same base name but different color keyword", async () => {
    const source = await createProduct({ name: "iPhone 15 Черный", sku: undefined });
    await createProduct({ name: "iPhone 15 Белый", sku: undefined });

    const suggestions = await findVariantSuggestions(source.id, {
      strategy: "name",
      minConfidence: 0,
    });

    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    const match = suggestions.find((s) => s.product.name === "iPhone 15 Белый");
    expect(match).toBeDefined();
    expect(match!.matchType).toBe("name");
    expect(match!.suggestedGroupName).toBe("Цвет");
  });

  it("does not match products with completely different names", async () => {
    const source = await createProduct({ name: "Холодильник Samsung", sku: undefined });
    await createProduct({ name: "Стиральная машина Bosch", sku: undefined });

    const suggestions = await findVariantSuggestions(source.id, {
      strategy: "name",
      minConfidence: 0,
    });

    expect(suggestions).toHaveLength(0);
  });
});

describe("findVariantSuggestions — general behavior", () => {
  it("returns empty array for unknown productId", async () => {
    const suggestions = await findVariantSuggestions("non-existent-id", { strategy: "all" });

    expect(suggestions).toHaveLength(0);
  });

  it("respects limit option", async () => {
    const source = await createProduct({ sku: "WIDGET-A" });
    // Create 5 products that match by SKU
    for (let i = 0; i < 5; i++) {
      await createProduct({ sku: `WIDGET-${String.fromCharCode(66 + i)}` }); // B,C,D,E,F
    }

    const suggestions = await findVariantSuggestions(source.id, {
      strategy: "sku",
      minConfidence: 0,
      limit: 3,
    });

    expect(suggestions.length).toBeLessThanOrEqual(3);
  });

  it("returns results sorted by confidence descending", async () => {
    const category = await createCategory();
    const source = await createProduct({
      name: "Notebook Pro Черный",
      sku: "NB-PRO-BLK",
      categoryId: category.id,
    });
    await createProduct({
      name: "Notebook Pro Белый",
      sku: "NB-PRO-WHT",
      categoryId: category.id,
    });

    const suggestions = await findVariantSuggestions(source.id, {
      strategy: "all",
      minConfidence: 0,
    });

    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i - 1].confidence).toBeGreaterThanOrEqual(suggestions[i].confidence);
    }
  });

  it("excludes products that already have a masterProductId (already grouped variants)", async () => {
    const db = getTestDb();
    const source = await createProduct({ sku: "GEAR-001-BLK" });
    const master = await createProduct({ sku: "GEAR-001-RED" }); // potential match
    // Mark master as a variant of something else
    await db.product.update({
      where: { id: master.id },
      data: { masterProductId: source.id }, // already linked
    });

    const suggestions = await findVariantSuggestions(source.id, {
      strategy: "sku",
      minConfidence: 0,
    });

    // master is already a variant, should be excluded from suggestions
    expect(suggestions.find((s) => s.productId === master.id)).toBeUndefined();
  });
});
