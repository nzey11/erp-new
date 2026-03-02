import { z } from "zod";

// POST /api/accounting/variant-types
export const createVariantTypeSchema = z.object({
  name: z.string().min(1, "Название типа обязательно"),
});

// PUT /api/accounting/variant-types/[id]
export const updateVariantTypeSchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  order: z.coerce.number().int().optional(),
});

// POST /api/accounting/variant-types/[id]/options
export const createVariantOptionSchema = z.object({
  value: z.string().min(1, "Значение опции обязательно"),
});
