import { z } from "zod";

// POST /api/ecommerce/checkout
export const checkoutSchema = z.object({
  deliveryType: z.enum(["pickup", "courier"], { message: "Тип доставки обязателен" }),
  addressId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
