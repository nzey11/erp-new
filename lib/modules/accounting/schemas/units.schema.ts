import { z } from "zod";

// POST /api/accounting/units
export const createUnitSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  shortName: z.string().min(1, "Сокращение обязательно"),
});

// PUT /api/accounting/units/[id]
export const updateUnitSchema = z.object({
  name: z.string().min(1).optional(),
  shortName: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});
