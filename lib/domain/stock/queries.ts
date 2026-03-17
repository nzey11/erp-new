import { db, toNumber } from "@/lib/shared/db";
import { requirePermission } from "@/lib/shared/authorization";
import type { StockFilters } from "./parse-filters";

/**
 * A single stock balance row — one entry per product+warehouse combination.
 */
export interface StockBalanceRow {
  /** Composite key: `${productId}-${warehouseId}` */
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  categoryName: string | null;
  warehouseId: string;
  warehouseName: string;
  unitShortName: string;
  quantity: number;
  reserve: number;
  available: number;
  purchasePrice: number | null;
  salePrice: number | null;
  /** quantity × averageCost (or purchasePrice fallback) */
  costValue: number | null;
  /** quantity × salePrice */
  saleValue: number | null;
}

/**
 * Result of getStockBalances query.
 */
export interface GetStockBalancesResult {
  items: StockBalanceRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Get stock balances with filtering and pagination.
 * Server-side only — direct DB access, no HTTP fetch.
 *
 * Mirrors the enhanced-mode logic from /api/accounting/stock but server-side,
 * so the balances tab can be a Server Component.
 */
export async function getStockBalances(
  filters: StockFilters
): Promise<GetStockBalancesResult> {
  const session = await requirePermission("stock:read");
  const tenantId = session.tenantId;

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 100;
  const skip = (page - 1) * pageSize;

  // Build StockRecord where clause
  // NOTE: intentionally no quantity > 0 filter — we show zero-balance records too
  // (products that had movements but are now empty should still appear in the stock view)
  const where: Record<string, unknown> = {
    warehouse: { tenantId },
  };

  if (filters.warehouseId) {
    where.warehouseId = filters.warehouseId;
  }

  if (filters.search) {
    where.product = {
      OR: [
        { name: { contains: filters.search, mode: "insensitive" } },
        { sku: { contains: filters.search, mode: "insensitive" } },
      ],
    };
  }

  // Fetch records + total in parallel
  const [records, total] = await Promise.all([
    db.stockRecord.findMany({
      where,
      include: {
        warehouse: { select: { id: true, name: true } },
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            unit: { select: { shortName: true } },
            category: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { product: { name: "asc" } },
      skip,
      take: pageSize,
    }),
    db.stockRecord.count({ where }),
  ]);

  if (records.length === 0) {
    return { items: [], total, page, pageSize };
  }

  const productIds = [...new Set(records.map((r) => r.productId))];

  // Fetch reserve (quantities in draft outgoing docs) and prices in parallel
  const now = new Date();

  const [draftOutgoingItems, purchasePrices, salePrices] = await Promise.all([
    // Reserve: sum quantities from draft outgoing documents
    db.documentItem.findMany({
      where: {
        productId: { in: productIds },
        document: {
          status: "draft",
          type: {
            in: ["outgoing_shipment", "supplier_return", "sales_order"],
          },
        },
      },
      select: {
        productId: true,
        quantity: true,
        document: { select: { warehouseId: true } },
      },
    }),

    // Latest active purchase price per product
    db.purchasePrice.findMany({
      where: {
        productId: { in: productIds },
        isActive: true,
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gte: now } }],
      },
      orderBy: { validFrom: "desc" },
      select: { productId: true, price: true },
    }),

    // Latest active sale price (default price list) per product
    db.salePrice.findMany({
      where: {
        productId: { in: productIds },
        isActive: true,
        priceListId: null,
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gte: now } }],
      },
      orderBy: { validFrom: "desc" },
      select: { productId: true, price: true },
    }),
  ]);

  // Build reserve map: key = `productId:warehouseId`
  const reserveMap: Record<string, number> = {};
  for (const item of draftOutgoingItems) {
    const key = `${item.productId}:${item.document.warehouseId ?? ""}`;
    reserveMap[key] = (reserveMap[key] ?? 0) + item.quantity;
  }

  // Build price maps — first entry wins (already ordered by validFrom desc)
  const purchasePriceMap: Record<string, number> = {};
  for (const pp of purchasePrices) {
    if (!(pp.productId in purchasePriceMap)) {
      purchasePriceMap[pp.productId] = toNumber(pp.price);
    }
  }

  const salePriceMap: Record<string, number> = {};
  for (const sp of salePrices) {
    if (!(sp.productId in salePriceMap)) {
      salePriceMap[sp.productId] = toNumber(sp.price);
    }
  }

  // Assemble rows
  const items: StockBalanceRow[] = records.map((r) => {
    const reserve = reserveMap[`${r.productId}:${r.warehouseId}`] ?? 0;
    const available = r.quantity - reserve;
    // Prefer moving-average cost (averageCost), fall back to purchase price
    const effectiveCost =
      toNumber(r.averageCost) > 0
        ? toNumber(r.averageCost)
        : (purchasePriceMap[r.productId] ?? null);
    const salePrice = salePriceMap[r.productId] ?? null;

    return {
      id: `${r.productId}-${r.warehouseId}`,
      productId: r.productId,
      productName: r.product.name,
      sku: r.product.sku ?? null,
      categoryName: r.product.category?.name ?? null,
      warehouseId: r.warehouseId,
      warehouseName: r.warehouse.name,
      unitShortName: r.product.unit.shortName,
      quantity: r.quantity,
      reserve,
      available,
      purchasePrice: purchasePriceMap[r.productId] ?? null,
      salePrice,
      costValue: effectiveCost != null ? r.quantity * effectiveCost : null,
      saleValue: salePrice != null ? r.quantity * salePrice : null,
    };
  });

  return { items, total, page, pageSize };
}
