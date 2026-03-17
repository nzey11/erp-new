import { db } from "@/lib/shared/db";
import { requirePermission } from "@/lib/shared/authorization";
import type { CounterpartyFilters, CounterpartyType } from "./parse-filters";

/**
 * Counterparty data with balance relation.
 */
export interface CounterpartyWithBalance {
  id: string;
  type: CounterpartyType;
  name: string;
  legalName: string | null;
  inn: string | null;
  phone: string | null;
  email: string | null;
  contactPerson: string | null;
  isActive: boolean;
  createdAt: Date;
  balance: {
    balanceRub: number;
  } | null;
}

/**
 * Result of getCounterparties query.
 */
export interface GetCounterpartiesResult {
  items: CounterpartyWithBalance[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Build Prisma where clause from filters.
 */
function buildWhereClause(
  filters: CounterpartyFilters,
  tenantId: string
): Record<string, unknown> {
  const where: Record<string, unknown> = { tenantId };

  if (filters.type) {
    where.type = filters.type;
  }

  if (filters.isActive !== undefined) {
    where.isActive = filters.isActive;
  }

  if (filters.search) {
    const searchTerm = filters.search;
    where.OR = [
      { name: { contains: searchTerm, mode: "insensitive" } },
      { legalName: { contains: searchTerm, mode: "insensitive" } },
      { inn: { contains: searchTerm, mode: "insensitive" } },
      { phone: { contains: searchTerm, mode: "insensitive" } },
      { email: { contains: searchTerm, mode: "insensitive" } },
    ];
  }

  return where;
}

/**
 * Build Prisma orderBy from filters.
 */
function buildOrderBy(
  filters: CounterpartyFilters
): Record<string, "asc" | "desc"> {
  const field = filters.sort || "name";
  const direction = filters.order === "desc" ? "desc" : "asc";

  // Map frontend field names to Prisma fields
  const fieldMap: Record<string, string> = {
    name: "name",
    type: "type",
    inn: "inn",
    createdAt: "createdAt",
  };

  const prismaField = fieldMap[field] || "name";
  return { [prismaField]: direction };
}

/**
 * Get counterparties with filtering and pagination.
 * Server-side only — direct DB access, no HTTP fetch.
 */
export async function getCounterparties(
  filters: CounterpartyFilters
): Promise<GetCounterpartiesResult> {
  const session = await requirePermission("counterparties:read");
  const tenantId = session.tenantId;

  const where = buildWhereClause(filters, tenantId);
  const orderBy = buildOrderBy(filters);
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  const skip = (page - 1) * pageSize;

  const [counterparties, total] = await Promise.all([
    db.counterparty.findMany({
      where,
      include: {
        balance: {
          select: {
            balanceRub: true,
          },
        },
      },
      orderBy,
      skip,
      take: pageSize,
    }),
    db.counterparty.count({ where }),
  ]);

  return {
    items: counterparties.map((c) => ({
      ...c,
      balance: c.balance
        ? { balanceRub: Number(c.balance.balanceRub) }
        : null,
    })) as CounterpartyWithBalance[],
    total,
    page,
    pageSize,
  };
}
