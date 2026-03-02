import { z } from "zod";

export const quickOrderSchema = z.object({
  productId: z.string().min(1, "ID товара обязателен"),
  variantId: z.string().nullable().optional(),
  quantity: z.number().int().positive("Количество должно быть положительным").default(1),
  customerName: z.string().min(1, "Имя обязательно"),
  customerPhone: z.string().min(6, "Телефон обязателен"),
  notes: z.string().nullable().optional(),
});
