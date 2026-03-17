import { db, toNumber } from "@/lib/shared/db";
import { requirePermission } from "@/lib/shared/authorization";
import type { PaymentFilters } from "./parse-filters";

/**
 * A single payment row returned by getPayments.
 * Compatible with PaymentWithRelations for backward compatibility.
 */
export interface PaymentRow {
  id: string;
  number: string;
  type: "income" | "expense";
  amount: number;
  paymentMethod: string;
  date: string;
  description: string | null;
  category: { id: string; name: string; type: string };
  counterparty: { id: string; name: string } | null;
  document: { id: string; number: string; type: string } | null;
}

/**
 * Alias for PaymentRow for components expecting PaymentWithRelations.
 */
export type PaymentWithRelations = PaymentRow;

/**
 * Result of getPayments query.
 */
export interface GetPaymentsResult {
  items: PaymentRow[];
  total: number;
  page: number;
  pageSize: number;
  incomeTotal: number;
  expenseTotal: number;
  netCashFlow: number;
}

/**
 * Get payments with filtering, sorting and pagination.
 * Server-side only — direct DB access, no HTTP fetch.
 */
export async function getPayments(
  filters: PaymentFilters
): Promise<GetPaymentsResult> {
  const session = await requirePermission("payments:read");
  const tenantId = session.tenantId;

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const skip = (page - 1) * pageSize;

  // Build where clause
  const where: Record<string, unknown> = { tenantId };

  if (filters.type) {
    where.type = filters.type;
  }

  if (filters.categoryId && filters.categoryId !== "all") {
    where.categoryId = filters.categoryId;
  }

  if (filters.counterpartyId && filters.counterpartyId !== "all") {
    where.counterpartyId = filters.counterpartyId;
  }

  if (filters.dateFrom || filters.dateTo) {
    where.date = {
      ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
      ...(filters.dateTo && { lte: new Date(filters.dateTo + "T23:59:59") }),
    };
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

  const [payments, total, incomeAgg, expenseAgg] = await Promise.all([
    db.payment.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, type: true } },
        counterparty: { select: { id: true, name: true } },
        document: { select: { id: true, number: true, type: true } },
      },
      orderBy,
      skip,
      take: pageSize,
    }),
    db.payment.count({ where }),
    db.payment.aggregate({
      _sum: { amount: true },
      where: { ...where, type: "income" },
    }),
    db.payment.aggregate({
      _sum: { amount: true },
      where: { ...where, type: "expense" },
    }),
  ]);

  const incomeTotal = toNumber(incomeAgg._sum.amount);
  const expenseTotal = toNumber(expenseAgg._sum.amount);

  const items: PaymentRow[] = payments.map((p) => ({
    id: p.id,
    number: p.number,
    type: p.type as "income" | "expense",
    amount: toNumber(p.amount),
    paymentMethod: p.paymentMethod,
    date: p.date.toISOString(),
    description: p.description,
    category: p.category,
    counterparty: p.counterparty,
    document: p.document,
  }));

  return {
    items,
    total,
    page,
    pageSize,
    incomeTotal,
    expenseTotal,
    netCashFlow: incomeTotal - expenseTotal,
  };
}
