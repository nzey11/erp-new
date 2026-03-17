import { db, toNumber } from "@/lib/shared/db";
import { requirePermission } from "@/lib/shared/authorization";
import type { SalesOrderFilters } from "./parse-filters";

/**
 * Payment status values for sales orders.
 */
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

/**
 * Delivery type values for sales orders.
 */
export type DeliveryType = "pickup" | "courier";

/**
 * Ecom status values for sales orders.
 * Mirrors OrderStatus enum from Prisma schema.
 */
export type EcomStatus =
  | "pending"
  | "paid"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

/**
 * Customer info included in sales order row.
 */
export interface SalesOrderCustomer {
  id: string;
  name: string | null;
  phone: string | null;
  telegramUsername: string | null;
}

/**
 * Counterparty info included in sales order row.
 */
export interface SalesOrderCounterparty {
  id: string;
  name: string;
}

/**
 * Warehouse info included in sales order row.
 */
export interface SalesOrderWarehouse {
  id: string;
  name: string;
}

/**
 * Count info included in sales order row.
 */
export interface SalesOrderCount {
  items: number;
}

/**
 * A single sales order row returned by getSalesOrders.
 * Mirrors the legacy SalesOrderDoc shape.
 */
export interface SalesOrderRow {
  id: string;
  number: string;
  type: string;
  status: EcomStatus;
  statusName: string;
  date: string;
  totalAmount: number;
  customerId: string | null;
  customer: SalesOrderCustomer | null;
  paymentStatus: PaymentStatus | null;
  deliveryType: DeliveryType | null;
  notes: string | null;
  counterparty: SalesOrderCounterparty | null;
  warehouse: SalesOrderWarehouse | null;
  _count: SalesOrderCount;
}

/**
 * Result of getSalesOrders query.
 */
export interface GetSalesOrdersResult {
  items: SalesOrderRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Status name mapping for EcomStatus values (Russian labels).
 */
const ECOM_STATUS_NAMES: Record<EcomStatus, string> = {
  pending: "Ожидает",
  paid: "Оплачен",
  processing: "В работе",
  shipped: "Отправлен",
  delivered: "Доставлен",
  cancelled: "Отменён",
};

/**
 * Get sales orders with filtering, sorting and pagination.
 * Server-side only — direct DB access, no HTTP fetch.
 * Always filters for type = "sales_order".
 */
export async function getSalesOrders(
  filters: SalesOrderFilters
): Promise<GetSalesOrdersResult> {
  const session = await requirePermission("documents:read");
  const tenantId = session.tenantId;

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  const skip = (page - 1) * pageSize;

  // Build where clause
  const where: Record<string, unknown> = {
    tenantId,
    type: "sales_order",
  };

  // Search by document number
  if (filters.search) {
    where.number = { contains: filters.search, mode: "insensitive" };
  }

  // Filter by EcomStatus (stored as status on Document)
  if (filters.status) {
    where.status = filters.status;
  }

  // Filter by paymentStatus
  if (filters.paymentStatus) {
    where.paymentStatus = filters.paymentStatus;
  }

  // Filter by source (ecom = has customerId, manual = no customerId)
  if (filters.source === "ecom") {
    where.customerId = { not: null };
  } else if (filters.source === "manual") {
    where.customerId = null;
  }

  // Date range filter
  if (filters.dateFrom || filters.dateTo) {
    where.date = {
      ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
      ...(filters.dateTo && { lte: new Date(filters.dateTo) }),
    };
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
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            telegramUsername: true,
          },
        },
        counterparty: {
          select: {
            id: true,
            name: true,
          },
        },
        warehouse: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            items: true,
          },
        },
      },
      orderBy,
      skip,
      take: pageSize,
    }),
    db.document.count({ where }),
  ]);

  const items: SalesOrderRow[] = documents.map((doc) => ({
    id: doc.id,
    number: doc.number,
    type: doc.type,
    status: (doc.status as EcomStatus) ?? "pending",
    statusName: ECOM_STATUS_NAMES[(doc.status as EcomStatus) ?? "pending"],
    date: doc.date.toISOString(),
    totalAmount: toNumber(doc.totalAmount),
    customerId: doc.customerId,
    customer: doc.customer,
    paymentStatus: (doc.paymentStatus as PaymentStatus) ?? null,
    deliveryType: (doc.deliveryType as DeliveryType) ?? null,
    notes: doc.notes,
    counterparty: doc.counterparty,
    warehouse: doc.warehouse,
    _count: doc._count,
  }));

  return { items, total, page, pageSize };
}
