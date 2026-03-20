import { db, toNumber } from "@/lib/shared/db";
import { requirePermission } from "@/lib/shared/authorization";
import { getDocTypeName } from "@/lib/modules/accounting/documents";
import type { StockDocumentFilters } from "./parse-filters";

/**
 * Stock document types — always restricted to these 4 types.
 */
export const STOCK_DOC_TYPES = [
  "stock_receipt",
  "write_off",
  "stock_transfer",
  "inventory_count",
] as const;

/**
 * A single stock document row returned by getStockDocuments.
 */
export interface StockDocumentRow {
  id: string;
  number: string;
  type: string;
  typeName: string;
  status: "draft" | "confirmed" | "cancelled";
  date: string;
  totalAmount: number;
  warehouse: { id: string; name: string } | null;
  counterparty: { id: string; name: string } | null;
  _count: { items: number };
}

/**
 * Result of getStockDocuments query.
 */
export interface GetStockDocumentsResult {
  items: StockDocumentRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Get stock documents with filtering, sorting and pagination.
 * Server-side only — direct DB access, no HTTP fetch.
 * Always restricts to STOCK_DOC_TYPES unless a specific type is requested.
 */
export async function getStockDocuments(
  filters: StockDocumentFilters
): Promise<GetStockDocumentsResult> {
  const session = await requirePermission("documents:read");
  const tenantId = session.tenantId;

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  const skip = (page - 1) * pageSize;

  // Build where clause
  const where: Record<string, unknown> = { tenantId };

  // Type filter: specific type takes precedence, otherwise all stock types
  if (filters.type) {
    where.type = filters.type;
  } else {
    where.type = { in: STOCK_DOC_TYPES };
  }

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.dateFrom || filters.dateTo) {
    const dateFilter: Record<string, Date> = {};
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom);
      from.setHours(0, 0, 0, 0);
      dateFilter.gte = from;
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59, 999);
      dateFilter.lte = to;
    }
    where.date = dateFilter;
  }

  if (filters.warehouseId) {
    where.warehouseId = filters.warehouseId;
  }

  if (filters.search) {
    where.number = { contains: filters.search, mode: "insensitive" };
  }

  // Build orderBy — default: date desc
  const orderBy: Record<string, string> = {};
  if (filters.sort) {
    orderBy[filters.sort] = filters.order ?? "desc";
  } else {
    orderBy.date = "desc";
  }

  const [documents, total] = await Promise.all([
    db.document.findMany({
      where,
      include: {
        warehouse: { select: { id: true, name: true } },
        counterparty: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
      orderBy,
      skip,
      take: pageSize,
    }),
    db.document.count({ where }),
  ]);

  const items: StockDocumentRow[] = documents.map((doc) => ({
    id: doc.id,
    number: doc.number,
    type: doc.type,
    typeName: getDocTypeName(doc.type as Parameters<typeof getDocTypeName>[0]),
    status: doc.status as "draft" | "confirmed" | "cancelled",
    date: doc.date.toISOString(),
    totalAmount: toNumber(doc.totalAmount),
    warehouse: doc.warehouse,
    counterparty: doc.counterparty,
    _count: doc._count,
  }));

  return { items, total, page, pageSize };
}
