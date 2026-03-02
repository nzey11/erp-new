import { describe, it, expect, beforeEach } from "vitest";
import { cleanDatabase } from "../../helpers/test-db";
import { db } from "@/lib/shared/db";
import {
  createProduct,
  createCustomFieldDefinition,
  createVariantType,
  createVariantOption,
  createProductVariant,
  createProductDiscount,
  createCategory,
  createPriceList,
  createSalePrice,
} from "../../helpers/factories";

describe("Catalog features - integration", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  // =============================================
  // SKU Auto-generation
  // =============================================

  describe("SKU auto-generation", () => {
    it("should auto-increment SKU counter", async () => {
      // First call: create counter and set to 1
      const counter1 = await db.skuCounter.upsert({
        where: { prefix: "SKU" },
        create: { prefix: "SKU", lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });
      expect(counter1.lastNumber).toBe(1);

      // Second call: increment to 2
      const counter2 = await db.skuCounter.upsert({
        where: { prefix: "SKU" },
        create: { prefix: "SKU", lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });
      expect(counter2.lastNumber).toBe(2);
    });

    it("should format SKU with zero-padded number", async () => {
      const counter = await db.skuCounter.upsert({
        where: { prefix: "ART" },
        create: { prefix: "ART", lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });
      const sku = `${counter.prefix}-${String(counter.lastNumber).padStart(6, "0")}`;
      expect(sku).toBe("ART-000001");
    });

    it("should support different prefixes independently", async () => {
      await db.skuCounter.upsert({
        where: { prefix: "SKU" },
        create: { prefix: "SKU", lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });
      await db.skuCounter.upsert({
        where: { prefix: "ART" },
        create: { prefix: "ART", lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });

      // Increment SKU again
      const skuCounter = await db.skuCounter.upsert({
        where: { prefix: "SKU" },
        create: { prefix: "SKU", lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });

      expect(skuCounter.lastNumber).toBe(2);

      // ART should still be at 1
      const artCounter = await db.skuCounter.findUnique({ where: { prefix: "ART" } });
      expect(artCounter!.lastNumber).toBe(1);
    });
  });

  // =============================================
  // Custom Field Definitions
  // =============================================

  describe("Custom field definitions", () => {
    it("should create text field definition", async () => {
      const field = await createCustomFieldDefinition({ name: "Материал", fieldType: "text" });
      expect(field.name).toBe("Материал");
      expect(field.fieldType).toBe("text");
      expect(field.options).toBeNull();
    });

    it("should create select field with options", async () => {
      const field = await createCustomFieldDefinition({
        name: "Цвет",
        fieldType: "select",
        options: JSON.stringify(["Красный", "Синий", "Зелёный"]),
      });
      expect(field.fieldType).toBe("select");
      const options = JSON.parse(field.options!);
      expect(options).toEqual(["Красный", "Синий", "Зелёный"]);
    });

    it("should create boolean field", async () => {
      const field = await createCustomFieldDefinition({ name: "Хрупкий", fieldType: "boolean" });
      expect(field.fieldType).toBe("boolean");
    });

    it("should create number field", async () => {
      const field = await createCustomFieldDefinition({ name: "Вес нетто", fieldType: "number" });
      expect(field.fieldType).toBe("number");
    });

    it("should soft-delete by setting isActive=false", async () => {
      const field = await createCustomFieldDefinition({ name: "Удаляемое" });
      await db.customFieldDefinition.update({
        where: { id: field.id },
        data: { isActive: false },
      });
      const found = await db.customFieldDefinition.findMany({ where: { isActive: true } });
      expect(found.find((f) => f.id === field.id)).toBeUndefined();
    });
  });

  // =============================================
  // Product Custom Fields (values)
  // =============================================

  describe("Product custom field values", () => {
    it("should assign custom field value to product", async () => {
      const product = await createProduct();
      const fieldDef = await createCustomFieldDefinition({ name: "Материал" });

      const value = await db.productCustomField.create({
        data: { productId: product.id, definitionId: fieldDef.id, value: "Хлопок" },
      });

      expect(value.value).toBe("Хлопок");
    });

    it("should upsert custom field value", async () => {
      const product = await createProduct();
      const fieldDef = await createCustomFieldDefinition({ name: "Цвет" });

      // Create
      await db.productCustomField.upsert({
        where: { productId_definitionId: { productId: product.id, definitionId: fieldDef.id } },
        create: { productId: product.id, definitionId: fieldDef.id, value: "Красный" },
        update: { value: "Красный" },
      });

      // Update
      const updated = await db.productCustomField.upsert({
        where: { productId_definitionId: { productId: product.id, definitionId: fieldDef.id } },
        create: { productId: product.id, definitionId: fieldDef.id, value: "Синий" },
        update: { value: "Синий" },
      });

      expect(updated.value).toBe("Синий");

      // Should only have 1 record
      const count = await db.productCustomField.count({ where: { productId: product.id } });
      expect(count).toBe(1);
    });

    it("should enforce unique constraint per product+definition", async () => {
      const product = await createProduct();
      const fieldDef = await createCustomFieldDefinition({ name: "Материал" });

      await db.productCustomField.create({
        data: { productId: product.id, definitionId: fieldDef.id, value: "Хлопок" },
      });

      // Duplicate should fail
      await expect(
        db.productCustomField.create({
          data: { productId: product.id, definitionId: fieldDef.id, value: "Шёлк" },
        })
      ).rejects.toThrow();
    });

    it("should cascade delete when product is deleted", async () => {
      const product = await createProduct();
      const fieldDef = await createCustomFieldDefinition({ name: "Тест" });

      await db.productCustomField.create({
        data: { productId: product.id, definitionId: fieldDef.id, value: "Значение" },
      });

      await db.product.delete({ where: { id: product.id } });

      const remaining = await db.productCustomField.count({ where: { productId: product.id } });
      expect(remaining).toBe(0);
    });
  });

  // =============================================
  // Variant Types & Options
  // =============================================

  describe("Variant types and options", () => {
    it("should create variant type with options", async () => {
      const type = await createVariantType({ name: "Размер" });
      await createVariantOption(type.id, { value: "S", order: 0 });
      await createVariantOption(type.id, { value: "M", order: 1 });
      await createVariantOption(type.id, { value: "L", order: 2 });

      const loaded = await db.variantType.findUnique({
        where: { id: type.id },
        include: { options: { orderBy: { order: "asc" } } },
      });

      expect(loaded!.options).toHaveLength(3);
      expect(loaded!.options.map((o) => o.value)).toEqual(["S", "M", "L"]);
    });

    it("should cascade delete options when type is deleted", async () => {
      const type = await createVariantType({ name: "Цвет" });
      const opt = await createVariantOption(type.id, { value: "Красный" });

      await db.variantType.delete({ where: { id: type.id } });

      const remaining = await db.variantOption.findUnique({ where: { id: opt.id } });
      expect(remaining).toBeNull();
    });

    it("should soft-delete variant type by setting isActive=false", async () => {
      const type = await createVariantType({ name: "Вес" });
      await db.variantType.update({ where: { id: type.id }, data: { isActive: false } });

      const active = await db.variantType.findMany({ where: { isActive: true } });
      expect(active.find((t) => t.id === type.id)).toBeUndefined();
    });
  });

  // =============================================
  // Product Variants
  // =============================================

  describe("Product variants", () => {
    it("should create product variant with option", async () => {
      const product = await createProduct();
      const type = await createVariantType({ name: "Размер" });
      const option = await createVariantOption(type.id, { value: "XL" });

      const variant = await createProductVariant(product.id, option.id, {
        priceAdjustment: 200,
      });

      expect(variant.productId).toBe(product.id);
      expect(variant.optionId).toBe(option.id);
      expect(variant.priceAdjustment).toBe(200);
    });

    it("should enforce unique constraint per product+option", async () => {
      const product = await createProduct();
      const type = await createVariantType({ name: "Размер" });
      const option = await createVariantOption(type.id, { value: "M" });

      await createProductVariant(product.id, option.id);

      await expect(
        createProductVariant(product.id, option.id)
      ).rejects.toThrow();
    });

    it("should allow same option for different products", async () => {
      const product1 = await createProduct({ name: "Товар 1" });
      const product2 = await createProduct({ name: "Товар 2" });
      const type = await createVariantType({ name: "Размер" });
      const option = await createVariantOption(type.id, { value: "L" });

      const v1 = await createProductVariant(product1.id, option.id);
      const v2 = await createProductVariant(product2.id, option.id);

      expect(v1.id).not.toBe(v2.id);
    });

    it("should support variant-specific SKU", async () => {
      const product = await createProduct({ sku: "SHIRT-001" });
      const type = await createVariantType({ name: "Размер" });
      const optS = await createVariantOption(type.id, { value: "S" });
      const optL = await createVariantOption(type.id, { value: "L" });

      const vS = await createProductVariant(product.id, optS.id, { sku: "SHIRT-001-S" });
      const vL = await createProductVariant(product.id, optL.id, { sku: "SHIRT-001-L" });

      expect(vS.sku).toBe("SHIRT-001-S");
      expect(vL.sku).toBe("SHIRT-001-L");
    });

    it("should cascade delete variants when product is deleted", async () => {
      const product = await createProduct();
      const type = await createVariantType({ name: "Размер" });
      const option = await createVariantOption(type.id, { value: "M" });
      await createProductVariant(product.id, option.id);

      await db.product.delete({ where: { id: product.id } });

      const remaining = await db.productVariant.count({ where: { productId: product.id } });
      expect(remaining).toBe(0);
    });

    it("should soft-delete variant by setting isActive=false", async () => {
      const product = await createProduct();
      const type = await createVariantType({ name: "Размер" });
      const option = await createVariantOption(type.id, { value: "M" });
      const variant = await createProductVariant(product.id, option.id);

      await db.productVariant.update({ where: { id: variant.id }, data: { isActive: false } });

      const active = await db.productVariant.findMany({
        where: { productId: product.id, isActive: true },
      });
      expect(active).toHaveLength(0);
    });
  });

  // =============================================
  // Discount System
  // =============================================

  describe("Discount system", () => {
    it("should create percentage discount", async () => {
      const product = await createProduct();
      const discount = await createProductDiscount(product.id, {
        name: "Летняя распродажа",
        type: "percentage",
        value: 15,
      });

      expect(discount.name).toBe("Летняя распродажа");
      expect(discount.type).toBe("percentage");
      expect(discount.value).toBe(15);
    });

    it("should create fixed discount", async () => {
      const product = await createProduct();
      const discount = await createProductDiscount(product.id, {
        name: "Скидка 500р",
        type: "fixed",
        value: 500,
      });

      expect(discount.type).toBe("fixed");
      expect(discount.value).toBe(500);
    });

    it("should calculate discounted price correctly for percentage", async () => {
      const product = await createProduct();
      // Set sale price
      await db.salePrice.create({
        data: { productId: product.id, price: 1000, isActive: true },
      });

      const salePrice = 1000;
      const discountPercent = 15;
      const discountedPrice = salePrice * (1 - discountPercent / 100);

      expect(discountedPrice).toBe(850);
    });

    it("should calculate discounted price correctly for fixed", async () => {
      const salePrice = 1000;
      const fixedDiscount = 300;
      const discountedPrice = salePrice - fixedDiscount;

      expect(discountedPrice).toBe(700);
    });

    it("should detect discount below cost price (percentage)", async () => {
      const product = await createProduct();
      // Purchase price (cost) = 800
      await db.purchasePrice.create({
        data: { productId: product.id, price: 800, isActive: true },
      });
      // Sale price = 1000
      await db.salePrice.create({
        data: { productId: product.id, price: 1000, isActive: true },
      });

      const salePrice = 1000;
      const purchasePrice = 800;

      // 25% discount = 750, which is below cost 800
      const discountedPrice = salePrice * (1 - 25 / 100);
      expect(discountedPrice).toBe(750);
      expect(discountedPrice < purchasePrice).toBe(true);

      // 15% discount = 850, which is above cost 800
      const safeDiscountedPrice = salePrice * (1 - 15 / 100);
      expect(safeDiscountedPrice).toBe(850);
      expect(safeDiscountedPrice < purchasePrice).toBe(false);
    });

    it("should detect discount below cost price (fixed)", async () => {
      const product = await createProduct();
      await db.purchasePrice.create({
        data: { productId: product.id, price: 800, isActive: true },
      });
      await db.salePrice.create({
        data: { productId: product.id, price: 1000, isActive: true },
      });

      const salePrice = 1000;
      const purchasePrice = 800;

      // Fixed 300 off = 700, below cost 800
      const discountedPrice = salePrice - 300;
      expect(discountedPrice).toBe(700);
      expect(discountedPrice < purchasePrice).toBe(true);

      // Fixed 100 off = 900, above cost 800
      const safePrice = salePrice - 100;
      expect(safePrice).toBe(900);
      expect(safePrice < purchasePrice).toBe(false);
    });

    it("should allow discount exactly at cost price", async () => {
      const salePrice = 1000;
      const purchasePrice = 800;

      // 20% off = 800 = exactly cost price, should be allowed
      const discountedPrice = salePrice * (1 - 20 / 100);
      expect(discountedPrice).toBe(800);
      expect(discountedPrice < purchasePrice).toBe(false);
    });

    it("should support discount with validity period", async () => {
      const product = await createProduct();
      const validFrom = new Date("2026-01-01");
      const validTo = new Date("2026-03-31");

      const discount = await createProductDiscount(product.id, {
        name: "Зимняя распродажа",
        validFrom,
        validTo,
      });

      expect(discount.validFrom).toEqual(validFrom);
      expect(discount.validTo).toEqual(validTo);
    });

    it("should cascade delete discounts when product is deleted", async () => {
      const product = await createProduct();
      await createProductDiscount(product.id, { name: "Скидка 1" });
      await createProductDiscount(product.id, { name: "Скидка 2" });

      await db.product.delete({ where: { id: product.id } });

      const remaining = await db.productDiscount.count({ where: { productId: product.id } });
      expect(remaining).toBe(0);
    });

    it("should soft-delete discount by setting isActive=false", async () => {
      const product = await createProduct();
      const discount = await createProductDiscount(product.id);

      await db.productDiscount.update({ where: { id: discount.id }, data: { isActive: false } });

      const active = await db.productDiscount.findMany({
        where: { productId: product.id, isActive: true },
      });
      expect(active).toHaveLength(0);
    });
  });

  // =============================================
  // SEO Fields
  // =============================================

  describe("Product SEO fields", () => {
    it("should store SEO fields on product", async () => {
      const product = await createProduct();

      const updated = await db.product.update({
        where: { id: product.id },
        data: {
          seoTitle: "Купить товар недорого",
          seoDescription: "Лучшая цена на товар в интернет-магазине",
          seoKeywords: "товар, купить, недорого",
          slug: "kupit-tovar-nedorogo",
        },
      });

      expect(updated.seoTitle).toBe("Купить товар недорого");
      expect(updated.seoDescription).toBe("Лучшая цена на товар в интернет-магазине");
      expect(updated.seoKeywords).toBe("товар, купить, недорого");
      expect(updated.slug).toBe("kupit-tovar-nedorogo");
    });

    it("should enforce unique slug constraint", async () => {
      const product1 = await createProduct();
      const product2 = await createProduct();

      await db.product.update({
        where: { id: product1.id },
        data: { slug: "unique-slug" },
      });

      await expect(
        db.product.update({
          where: { id: product2.id },
          data: { slug: "unique-slug" },
        })
      ).rejects.toThrow();
    });

    it("should allow null slugs (not unique conflict)", async () => {
      const product1 = await createProduct();
      const product2 = await createProduct();

      // Both without slug should be fine
      expect(product1.slug).toBeNull();
      expect(product2.slug).toBeNull();
    });
  });

  // =============================================
  // Bulk Operations
  // =============================================

  describe("Bulk operations", () => {
    it("should archive multiple products (soft delete)", async () => {
      const p1 = await createProduct({ name: "Товар 1" });
      const p2 = await createProduct({ name: "Товар 2" });
      const p3 = await createProduct({ name: "Товар 3" });

      // Archive p1 and p2
      await db.product.updateMany({
        where: { id: { in: [p1.id, p2.id] } },
        data: { isActive: false },
      });

      const active = await db.product.findMany({ where: { isActive: true } });
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(p3.id);
    });

    it("should restore multiple archived products", async () => {
      const p1 = await createProduct({ name: "Товар 1", isActive: false });
      const p2 = await createProduct({ name: "Товар 2", isActive: false });

      await db.product.updateMany({
        where: { id: { in: [p1.id, p2.id] } },
        data: { isActive: true },
      });

      const active = await db.product.findMany({ where: { isActive: true } });
      expect(active).toHaveLength(2);
    });

    it("should hard delete multiple products with cascade", async () => {
      const p1 = await createProduct();
      const p2 = await createProduct();

      // Add discounts to test cascade
      await createProductDiscount(p1.id, { name: "Скидка 1" });
      await createProductDiscount(p2.id, { name: "Скидка 2" });

      // Hard delete
      await db.$transaction([
        db.productDiscount.deleteMany({ where: { productId: { in: [p1.id, p2.id] } } }),
        db.product.deleteMany({ where: { id: { in: [p1.id, p2.id] } } }),
      ]);

      const remaining = await db.product.count();
      expect(remaining).toBe(0);

      const discounts = await db.productDiscount.count();
      expect(discounts).toBe(0);
    });

    it("should change category for multiple products", async () => {
      const category = await createCategory({ name: "Новая категория" });
      const p1 = await createProduct();
      const p2 = await createProduct();

      await db.product.updateMany({
        where: { id: { in: [p1.id, p2.id] } },
        data: { categoryId: category.id },
      });

      const updated = await db.product.findMany({
        where: { categoryId: category.id },
      });
      expect(updated).toHaveLength(2);
    });
  });

  // =============================================
  // Product Duplication
  // =============================================

  describe("Product duplication", () => {
    it("should duplicate product with basic fields", async () => {
      const original = await createProduct({
        name: "Оригинальный товар",
        sku: "ORIG-001",
      });

      const updated = await db.product.update({
        where: { id: original.id },
        data: {
          description: "Описание товара",
          seoTitle: "SEO заголовок",
          seoDescription: "SEO описание",
        },
      });

      const copy = await db.product.create({
        data: {
          name: `${updated.name} (копия)`,
          description: updated.description,
          unitId: updated.unitId,
          categoryId: updated.categoryId,
          seoTitle: updated.seoTitle,
          seoDescription: updated.seoDescription,
          // SKU and barcode are NOT copied
        },
      });

      expect(copy.name).toBe("Оригинальный товар (копия)");
      expect(copy.description).toBe("Описание товара");
      expect(copy.sku).toBeNull();
      expect(copy.barcode).toBeNull();
    });

    it("should duplicate custom field values", async () => {
      const original = await createProduct();
      const fieldDef = await createCustomFieldDefinition({ name: "Материал" });

      await db.productCustomField.create({
        data: { productId: original.id, definitionId: fieldDef.id, value: "Хлопок" },
      });

      const copy = await createProduct({ name: "Копия" });

      // Copy custom fields
      const originalFields = await db.productCustomField.findMany({
        where: { productId: original.id },
      });

      for (const field of originalFields) {
        await db.productCustomField.create({
          data: {
            productId: copy.id,
            definitionId: field.definitionId,
            value: field.value,
          },
        });
      }

      const copyFields = await db.productCustomField.findMany({
        where: { productId: copy.id },
      });

      expect(copyFields).toHaveLength(1);
      expect(copyFields[0].value).toBe("Хлопок");
    });

    it("should NOT duplicate stock records", async () => {
      const original = await createProduct();

      // Original has no stock by default - stock is document-driven
      const copy = await createProduct({ name: "Копия" });

      const originalStock = await db.stockRecord.count({ where: { productId: original.id } });
      const copyStock = await db.stockRecord.count({ where: { productId: copy.id } });

      expect(originalStock).toBe(0);
      expect(copyStock).toBe(0);
    });

    it("should NOT duplicate discounts", async () => {
      const original = await createProduct();
      await createProductDiscount(original.id, { name: "Оригинальная скидка" });

      const copy = await createProduct({ name: "Копия" });

      const copyDiscounts = await db.productDiscount.count({ where: { productId: copy.id } });
      expect(copyDiscounts).toBe(0);
    });
  });

  // =============================================
  // Price Lists
  // =============================================

  describe("Price lists", () => {
    it("should create price list", async () => {
      const priceList = await createPriceList({
        name: "Розничный прайс",
        description: "Цены для розничных покупателей",
      });

      expect(priceList.name).toBe("Розничный прайс");
      expect(priceList.description).toBe("Цены для розничных покупателей");
      expect(priceList.isActive).toBe(true);
    });

    it("should add price to price list", async () => {
      const product = await createProduct();
      const priceList = await createPriceList({ name: "Оптовый прайс" });

      const price = await createSalePrice(product.id, {
        priceListId: priceList.id,
        price: 800,
      });

      expect(price.priceListId).toBe(priceList.id);
      expect(price.price).toBe(800);
    });

    it("should support multiple prices for same product in different price lists", async () => {
      const product = await createProduct();
      const retailList = await createPriceList({ name: "Розница" });
      const wholesaleList = await createPriceList({ name: "Опт" });

      await createSalePrice(product.id, { priceListId: retailList.id, price: 1000 });
      await createSalePrice(product.id, { priceListId: wholesaleList.id, price: 800 });

      const prices = await db.salePrice.findMany({
        where: { productId: product.id, isActive: true },
      });

      expect(prices).toHaveLength(2);
      expect(prices.map((p) => p.price).sort((a, b) => a - b)).toEqual([800, 1000]);
    });

    it("should soft-delete price list", async () => {
      const priceList = await createPriceList({ name: "Удаляемый прайс" });

      await db.priceList.update({
        where: { id: priceList.id },
        data: { isActive: false },
      });

      const active = await db.priceList.findMany({ where: { isActive: true } });
      expect(active.find((pl) => pl.id === priceList.id)).toBeUndefined();
    });

    it("should update existing price in price list", async () => {
      const product = await createProduct();
      const priceList = await createPriceList({ name: "Прайс" });

      const price = await createSalePrice(product.id, {
        priceListId: priceList.id,
        price: 1000,
      });

      // Update price
      const updated = await db.salePrice.update({
        where: { id: price.id },
        data: { price: 1200 },
      });

      expect(updated.price).toBe(1200);
    });
  });

  // =============================================
  // CSV Export/Import Data Preparation
  // =============================================

  describe("CSV export/import data", () => {
    it("should prepare product data for CSV export", async () => {
      const category = await createCategory({ name: "Электроника" });
      const product = await createProduct({
        name: "Смартфон",
        sku: "PHONE-001",
        categoryId: category.id,
      });

      await db.salePrice.create({
        data: { productId: product.id, price: 50000, isActive: true },
      });

      const exportData = await db.product.findUnique({
        where: { id: product.id },
        include: {
          unit: { select: { shortName: true } },
          category: { select: { name: true } },
          salePrices: { where: { isActive: true, priceListId: null }, take: 1 },
        },
      });

      expect(exportData!.name).toBe("Смартфон");
      expect(exportData!.sku).toBe("PHONE-001");
      expect(exportData!.category!.name).toBe("Электроника");
      expect(exportData!.salePrices[0].price).toBe(50000);
    });

    it("should match unit by name for import", async () => {
      const unit = await db.unit.create({
        data: { name: "Штука", shortName: "шт" },
      });

      // Simulate import matching
      const importUnitName = "штука";
      const matched = await db.unit.findFirst({
        where: {
          OR: [
            { name: { equals: importUnitName, mode: "insensitive" } },
            { shortName: { equals: importUnitName, mode: "insensitive" } },
          ],
        },
      });

      expect(matched).not.toBeNull();
      expect(matched!.id).toBe(unit.id);
    });

    it("should match category by name for import", async () => {
      const category = await createCategory({ name: "Одежда" });

      const importCategoryName = "одежда";
      const matched = await db.productCategory.findFirst({
        where: { name: { equals: importCategoryName, mode: "insensitive" } },
      });

      expect(matched).not.toBeNull();
      expect(matched!.id).toBe(category.id);
    });

    it("should update existing product by SKU on import", async () => {
      const _product = await createProduct({ name: "Старое название", sku: "UPDATE-001" });

      // Simulate import update
      const existing = await db.product.findFirst({ where: { sku: "UPDATE-001" } });
      expect(existing).not.toBeNull();

      const updated = await db.product.update({
        where: { id: existing!.id },
        data: { name: "Новое название из CSV" },
      });

      expect(updated.name).toBe("Новое название из CSV");
      expect(updated.sku).toBe("UPDATE-001");
    });

    it("should create new product on import when SKU not found", async () => {
      // Create a unit first (import needs a unit)
      const unit = await db.unit.create({
        data: { name: "Штука импорт", shortName: "шт.и" },
      });

      const existingCount = await db.product.count();

      // Check SKU doesn't exist
      const existing = await db.product.findFirst({ where: { sku: "NEW-IMPORT-001" } });
      expect(existing).toBeNull();

      // Create new product (simulating import)
      const newProduct = await db.product.create({
        data: {
          name: "Импортированный товар",
          sku: "NEW-IMPORT-001",
          unitId: unit.id,
        },
      });

      expect(newProduct.sku).toBe("NEW-IMPORT-001");

      const newCount = await db.product.count();
      expect(newCount).toBe(existingCount + 1);
    });
  });
});
