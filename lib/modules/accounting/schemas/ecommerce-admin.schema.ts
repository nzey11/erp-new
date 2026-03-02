import { z } from "zod";

// PUT /api/accounting/ecommerce/orders/[id]
export const updateOrderStatusSchema = z.object({
  status: z.enum(
    ["pending", "paid", "processing", "shipped", "delivered", "cancelled"],
    { message: "Некорректный статус заказа" }
  ),
});

// PUT /api/accounting/ecommerce/reviews
export const updateReviewSchema = z.object({
  isPublished: z.boolean(),
});

// POST /api/accounting/ecommerce/promo-blocks
export const createPromoBlockSchema = z.object({
  title: z.string().min(1, "Заголовок обязателен"),
  imageUrl: z.string().min(1, "URL изображения обязателен"),
  subtitle: z.string().nullable().optional(),
  linkUrl: z.string().nullable().optional(),
  order: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});

// PUT /api/accounting/ecommerce/promo-blocks
export const updatePromoBlockSchema = createPromoBlockSchema;
