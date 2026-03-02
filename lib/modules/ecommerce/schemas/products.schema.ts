import { z } from "zod";

// GET /api/ecommerce/products
export const queryStorefrontProductsSchema = z.object({
  search: z.string().optional().default(""),
  categoryId: z.string().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(60).default(24),
  sort: z.enum(["name", "newest", "price_asc", "price_desc"]).optional(),
});

// GET /api/ecommerce/orders
export const queryCustomerOrdersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(10),
});
