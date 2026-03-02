import { z } from "zod";

// POST /api/accounting/custom-fields
export const createCustomFieldSchema = z.object({
  name: z.string().min(1, "Название поля обязательно"),
  fieldType: z.enum(["text", "number", "select", "boolean"]).default("text"),
  options: z.array(z.string()).optional(),
});

// PUT /api/accounting/custom-fields/[id]
export const updateCustomFieldSchema = z.object({
  name: z.string().min(1).optional(),
  fieldType: z.enum(["text", "number", "select", "boolean"]).optional(),
  options: z.union([z.array(z.string()), z.string()]).optional(),
  isActive: z.boolean().optional(),
  order: z.coerce.number().int().optional(),
});
