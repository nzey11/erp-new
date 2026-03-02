import { z } from "zod";

// POST /api/ecommerce/reviews
export const createReviewSchema = z.object({
  productId: z.string().min(1, "ID товара обязателен"),
  rating: z.coerce.number().int().min(1, "Минимальная оценка 1").max(5, "Максимальная оценка 5"),
  title: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
  orderId: z.string().nullable().optional(),
});
