import { db, toNumber } from "@/lib/shared/db";
import { requirePermission } from "@/lib/shared/authorization";
import type { PurchaseFilters } from "./parse-filters";
import { getDocTypeName } from "@/lib/modules/accounting/documents";

/**
 * Purchase document types — the "purchases group"
 */
const PURCHASE_TYPES = [
  "purchase_order",
  "incoming_shipment",
  "supplier_return",
] as const;

/**
 * A single purchase document row.
 */
export interface PurchaseDocument {
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
 * Result of getPurchaseDocuments query.
 */
export interface GetPurchaseDocumentsResult {
  items: PurchaseDocument[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Get purchase documents with filtering and pagination.
 * Server-side only — direct DB access, no HTTP fetch.
 */
export async function getPurchaseDocuments(
  filters: PurchaseFilters
): Promise<GetPurchaseDocumentsResult> {
  const session = await requirePermission("documents:read");
  const tenantId = session.tenantId;

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  const skip = (page - 1) * pageSize;

  // Build where clause
  const where: Record<string, unknown> = {
    tenantId,
  };

  // Type filter: either specific type or all purchase types
  if (filters.type && PURCHASE_TYPES.includes(filters.type as typeof PURCHASE_TYPES[number])) {
    where.type = filters.type;
  } else {
    where.type = { in: PURCHASE_TYPES };
  }

  // Status filter
  if (filters.status) {
    where.status = filters.status;
  }

  // Date range filter
  if (filters.dateFrom || filters.dateTo) {
    where.date = {
      ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
      ...(filters.dateTo && { lte: new Date(filters.dateTo) }),
    };
  }

  // Counterparty filter
  if (filters.counterpartyId) {
    where.counterpartyId = filters.counterpartyId;
  }

  // Search by document number
  if (filters.search) {
    where.number = { contains: filters.search, mode: "insensitive" };
  }

  // Build orderBy
  const orderBy: Record<string, string> = {};
  if (filters.sort) {
    orderBy[filters.sort] = filters.order ?? "desc";
  } else {
    orderBy.date = "desc";
  }

  // Fetch documents + total in parallel
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

  // Map to PurchaseDocument with enriched typeName
  const items: PurchaseDocument[] = documents.map((doc) => ({
    id: doc.id,
    number: doc.number,
    type: doc.type,
    typeName: getDocTypeName(doc.type as typeof PURCHASE_TYPES[number]),
    status: doc.status as "draft" | "confirmed" | "cancelled",
    date: doc.date.toISOString(),
    totalAmount: toNumber(doc.totalAmount),
    warehouse: doc.warehouse,
    counterparty: doc.counterparty,
    _count: doc._count,
  }));

  return { items, total, page, pageSize };
}
