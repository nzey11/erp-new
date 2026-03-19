import { z } from "zod";

// POST /api/ecommerce/cart
export const addToCartSchema = z.object({
  productId: z.string().min(1, "ID товара обязателен"),
  variantId: z.string().nullable().optional(),
  quantity: z.coerce.number().int().positive("Количество должно быть положительным"),
});
