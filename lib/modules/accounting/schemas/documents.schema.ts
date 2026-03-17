import { z } from "zod";

const documentItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().nonnegative(),
  price: z.coerce.number().nonnegative().optional(),
  expectedQty: z.coerce.number().nullable().optional(),
  actualQty: z.coerce.number().nullable().optional(),
});

// POST /api/accounting/documents
export const createDocumentSchema = z.object({
  type: z.enum([
    "stock_receipt", "write_off", "stock_transfer", "inventory_count",
    "purchase_order", "incoming_shipment", "supplier_return",
    "sales_order", "outgoing_shipment", "customer_return",
    "incoming_payment", "outgoing_payment",
  ]),
  date: z.string().optional(),
  warehouseId: z.string().nullable().optional(),
  targetWarehouseId: z.string().nullable().optional(),
  counterpartyId: z.string().nullable().optional(),
  paymentType: z.enum(["cash", "bank_transfer", "card"]).nullable().optional(),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z.array(documentItemSchema).optional().default([]),
  linkedDocumentId: z.string().nullable().optional(),
  // Optional pre-set total for payment documents (incoming_payment / outgoing_payment)
  // that carry no line items. When provided and items is empty, totalAmount is used as-is.
  totalAmount: z.coerce.number().nonnegative().optional(),
});

// PUT /api/accounting/documents/[id]
export const updateDocumentSchema = z.object({
  date: z.string().optional(),
  warehouseId: z.string().nullable().optional(),
  targetWarehouseId: z.string().nullable().optional(),
  counterpartyId: z.string().nullable().optional(),
  paymentType: z.enum(["cash", "bank_transfer", "card"]).nullable().optional(),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z.array(documentItemSchema).optional(),
});

// GET /api/accounting/documents
export const queryDocumentsSchema = z.object({
  type: z.string().optional(),
  types: z.string().optional(),
  status: z.string().optional(),
  warehouseId: z.string().optional(),
  counterpartyId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional().default(""),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});
