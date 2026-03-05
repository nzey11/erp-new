import { z } from "zod";

// POST /api/ecommerce/checkout
export const checkoutSchema = z.object({
  deliveryType: z.enum(["pickup", "courier"]),
  addressId: z.string().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

// POST /api/accounting/orders/:id/confirm-payment
export const confirmPaymentSchema = z.object({
  paymentExternalId: z.string().min(1),
  paymentMethod: z.enum(["tochka", "cash"]),
});

// GET /api/accounting/orders (admin)
export const queryEcomOrdersSchema = z.object({
  status: z.enum(["draft", "confirmed", "cancelled"]).optional(),
  paymentStatus: z.enum(["pending", "paid", "failed", "refunded"]).optional(),
  search: z.string().optional().default(""),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});
