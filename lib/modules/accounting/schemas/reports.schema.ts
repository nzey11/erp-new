import { z } from "zod";

// GET /api/accounting/reports/cash-flow, profit-loss, profitability
export const dateRangeSchema = z.object({
  dateFrom: z.string().min(1, "Дата начала обязательна"),
  dateTo: z.string().min(1, "Дата окончания обязательна"),
});

// GET /api/accounting/stock
export const queryStockSchema = z.object({
  warehouseId: z.string().optional(),
  productId: z.string().optional(),
  search: z.string().optional(),
  nonZero: z.string().optional(),
  enhanced: z.string().optional(),
});

// POST /api/accounting/sku
export const generateSkuSchema = z.object({
  prefix: z.string().default("SKU"),
});
