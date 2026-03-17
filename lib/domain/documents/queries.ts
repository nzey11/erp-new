import { db, toNumber } from "@/lib/shared/db";
import { requirePermission } from "@/lib/shared/authorization";
import { getDocTypeName } from "@/lib/modules/accounting/documents";
import type { DocumentFilters } from "./parse-filters";

/**
 * All 12 document types grouped for convenience.
 * Mirrors DOC_TYPE_OPTIONS in legacy DocumentsTable — kept in sync manually.
 */
export const DOC_TYPES_BY_GROUP: Record<string, string[]> = {
  stock: ["stock_receipt", "write_off", "stock_transfer", "inventory_count"],
  purchases: ["purchase_order", "incoming_shipment", "supplier_return"],
  sales: ["sales_order", "outgoing_shipment", "customer_return"],
  finance: ["incoming_payment", "outgoing_payment"],
};

export const ALL_DOC_TYPES = Object.values(DOC_TYPES_BY_GROUP).flat();

/**
 * A single document row returned by getDocuments.
 */
export interface DocumentRow {
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
 * Result of getDocuments query.
 */
export interface GetDocumentsResult {
  items: DocumentRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Get documents with filtering, sorting and pagination.
 * Server-side only — direct DB access, no HTTP fetch.
 */
export async function getDocuments(
  filters: DocumentFilters
): Promise<GetDocumentsResult> {
  const session = await requirePermission("documents:read");
  const tenantId = session.tenantId;

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  const skip = (page - 1) * pageSize;

  // Build where clause
  const where: Record<string, unknown> = { tenantId };

  // Type takes precedence over group
  if (filters.type) {
    where.type = filters.type;
  } else if (filters.group && DOC_TYPES_BY_GROUP[filters.group]) {
    where.type = { in: DOC_TYPES_BY_GROUP[filters.group] };
  }
  // If neither type nor group: show all — no type constraint added

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.dateFrom || filters.dateTo) {
    where.date = {
      ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
      ...(filters.dateTo && { lte: new Date(filters.dateTo) }),
    };
  }

  if (filters.counterpartyId) {
    where.counterpartyId = filters.counterpartyId;
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

  const items: DocumentRow[] = documents.map((doc) => ({
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
