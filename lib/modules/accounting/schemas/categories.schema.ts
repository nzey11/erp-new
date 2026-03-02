import { z } from "zod";

// POST /api/accounting/categories
export const createCategorySchema = z.object({
  name: z.string().min(1, "Название категории обязательно"),
  parentId: z.string().nullable().optional(),
  order: z.coerce.number().int().default(0),
});

// PUT /api/accounting/categories/[id]
export const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  parentId: z.string().nullable().optional(),
  order: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});
