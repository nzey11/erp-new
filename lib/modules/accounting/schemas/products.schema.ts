import { z } from "zod";

// POST /api/accounting/products
export const createProductSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  sku: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  unitId: z.string().min(1, "Единица измерения обязательна"),
  categoryId: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  purchasePrice: z.union([z.coerce.number().nonnegative(), z.literal(""), z.null()]).optional(),
  salePrice: z.union([z.coerce.number().nonnegative(), z.literal(""), z.null()]).optional(),
  seoTitle: z.string().nullable().optional(),
  seoDescription: z.string().nullable().optional(),
  seoKeywords: z.string().nullable().optional(),
  slug: z.string().nullable().optional(),
  autoSku: z.union([z.boolean(), z.string()]).optional(),
  publishedToStore: z.boolean().optional(),
});

// PUT /api/accounting/products/[id]
export const updateProductSchema = createProductSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// GET /api/accounting/products
export const queryProductsSchema = z.object({
  search: z.string().optional().default(""),
  categoryId: z.string().optional(),
  active: z.string().optional(),
  published: z.enum(["true", "false"]).optional(),
  hasDiscount: z.enum(["true", "false"]).optional(),
  variantStatus: z.enum(["masters", "variants", "unlinked"]).optional(),
  sortBy: z.enum(["name", "sku", "purchasePrice", "salePrice", "createdAt"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(50),
});

// POST /api/accounting/products/[id]/variants
export const createVariantSchema = z.object({
  optionId: z.string().min(1, "Опция обязательна"),
  sku: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  priceAdjustment: z.coerce.number().default(0),
});

// POST /api/accounting/products/[id]/discounts
export const createDiscountSchema = z.object({
  name: z.string().min(1, "Название скидки обязательно"),
  type: z.enum(["percentage", "fixed"], { message: "Тип должен быть percentage или fixed" }),
  value: z.coerce.number().positive("Значение должно быть положительным"),
  validFrom: z.string().optional(),
  validTo: z.string().nullable().optional(),
});

// PUT /api/accounting/products/[id]/custom-fields
export const updateCustomFieldValuesSchema = z.object({
  fields: z.array(
    z.object({
      definitionId: z.string().min(1),
      value: z.string(),
    })
  ),
});

// POST /api/accounting/products/[id]/variant-links
export const createVariantLinkSchema = z.object({
  linkedProductId: z.string().min(1, "ID связанного товара обязателен"),
  groupName: z.string().optional(),
});

// POST /api/accounting/products/bulk
export const bulkProductActionSchema = z.object({
  action: z.enum(["archive", "restore", "delete", "changeCategory"]),
  productIds: z.array(z.string().min(1)).min(1, "Выберите хотя бы один товар"),
  categoryId: z.string().optional(), // for changeCategory action
});

// GET /api/accounting/products/export
export const exportProductsSchema = z.object({
  search: z.string().optional(),
  categoryId: z.string().optional(),
  active: z.string().optional(),
  published: z.enum(["true", "false"]).optional(),
  hasDiscount: z.enum(["true", "false"]).optional(),
  format: z.enum(["csv"]).default("csv"),
  columns: z.string().optional(), // comma-separated column names
});

// POST /api/accounting/products/import
export const importProductsSchema = z.object({
  products: z.array(
    z.object({
      name: z.string().min(1),
      sku: z.string().optional(),
      barcode: z.string().optional(),
      description: z.string().optional(),
      unitName: z.string().optional(), // will match by name
      categoryName: z.string().optional(), // will match by name
      purchasePrice: z.coerce.number().nonnegative().optional(),
      salePrice: z.coerce.number().nonnegative().optional(),
    })
  ).min(1, "Добавьте хотя бы один товар"),
  updateExisting: z.boolean().default(false), // update if sku matches
});
