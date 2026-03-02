import { z } from "zod";

// POST /api/accounting/counterparties
export const createCounterpartySchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  type: z.enum(["customer", "supplier", "both"]).default("customer"),
  legalName: z.string().nullable().optional(),
  inn: z.string().nullable().optional(),
  kpp: z.string().nullable().optional(),
  bankAccount: z.string().nullable().optional(),
  bankName: z.string().nullable().optional(),
  bik: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  contactPerson: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// PUT /api/accounting/counterparties/[id]
export const updateCounterpartySchema = createCounterpartySchema.partial().extend({
  isActive: z.boolean().optional(),
});

// GET /api/accounting/counterparties
export const queryCounterpartiesSchema = z.object({
  search: z.string().optional().default(""),
  type: z.string().optional(),
  active: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

// POST /api/accounting/counterparties/[id]/interactions
export const createInteractionSchema = z.object({
  type: z.string().min(1, "Тип взаимодействия обязателен"),
  subject: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});
