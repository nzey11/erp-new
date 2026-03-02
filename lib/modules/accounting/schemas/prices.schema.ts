import { z } from "zod";

// POST /api/accounting/prices/sale
export const createSalePriceSchema = z.object({
  productId: z.string().min(1, "ID товара обязателен"),
  price: z.coerce.number().nonnegative("Цена должна быть неотрицательной"),
  priceListId: z.string().nullable().optional(),
  currency: z.string().default("RUB"),
  validFrom: z.string().optional(),
  validTo: z.string().nullable().optional(),
});

// POST /api/accounting/prices/purchase
export const createPurchasePriceSchema = z.object({
  productId: z.string().min(1, "ID товара обязателен"),
  price: z.coerce.number().nonnegative("Цена должна быть неотрицательной"),
  supplierId: z.string().nullable().optional(),
  currency: z.string().default("RUB"),
  validFrom: z.string().optional(),
  validTo: z.string().nullable().optional(),
});

// GET /api/accounting/prices/sale
export const querySalePricesSchema = z.object({
  productId: z.string().optional(),
  priceListId: z.string().optional(),
  active: z.string().optional(),
});

// GET /api/accounting/prices/purchase
export const queryPurchasePricesSchema = z.object({
  productId: z.string().optional(),
  supplierId: z.string().optional(),
  active: z.string().optional(),
});

// POST /api/accounting/price-lists
export const createPriceListSchema = z.object({
  name: z.string().min(1, "Название прайс-листа обязательно"),
  description: z.string().nullable().optional(),
});

// PUT /api/accounting/price-lists/[id]
export const updatePriceListSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

// POST /api/accounting/price-lists/[id]/prices
export const addPriceListPriceSchema = z.object({
  productId: z.string().min(1, "ID товара обязателен"),
  price: z.coerce.number().nonnegative("Цена должна быть неотрицательной"),
  validFrom: z.string().optional(),
  validTo: z.string().nullable().optional(),
});

// PUT /api/accounting/price-lists/[id]/prices/[priceId]
export const updatePriceListPriceSchema = z.object({
  price: z.coerce.number().nonnegative().optional(),
  validFrom: z.string().optional(),
  validTo: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});
