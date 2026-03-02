import { z } from "zod";

// POST /api/accounting/warehouses
export const createWarehouseSchema = z.object({
  name: z.string().min(1, "Название склада обязательно"),
  address: z.string().nullable().optional(),
  responsibleName: z.string().nullable().optional(),
});

// PUT /api/accounting/warehouses/[id]
export const updateWarehouseSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().nullable().optional(),
  responsibleName: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});
