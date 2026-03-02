import { z } from "zod";

// POST /api/ecommerce/favorites
export const addFavoriteSchema = z.object({
  productId: z.string().min(1, "ID товара обязателен"),
});
