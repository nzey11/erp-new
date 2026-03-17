import { db, toNumber } from "@/lib/shared/db";
import { requirePermission } from "@/lib/shared/authorization";
import type { ProductFilters } from "./parse-filters";

/**
 * Product with related data for the catalog list.
 */
export interface ProductWithRelations {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  imageUrl: string | null;
  isActive: boolean;
  publishedToStore: boolean;
  createdAt: Date;
  // Unit
  unit: { id: string; shortName: string };
  // Category
  category: { id: string; name: string } | null;
  // Prices (current active)
  purchasePrice: number | null;
  salePrice: number | null;
  // Discounts
  discountedPrice: number | null;
  discountValidTo: Date | null;
  discountName: string | null;
  // Variants
  variantCount: number;
  childVariantCount: number;
  masterProductId: string | null;
  masterProduct: { id: string; name: string } | null;
  isMainInGroup: boolean;
  variantGroupName: string | null;
}

/**
 * Result of getProducts query.
 */
export interface GetProductsResult {
  items: ProductWithRelations[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Build Prisma where clause from filters.
 */
function buildWhereClause(
  filters: ProductFilters,
  tenantId: string
): Record<string, unknown> {
  const where: Record<string, unknown> = { tenantId };

  if (filters.isActive !== undefined) {
    where.isActive = filters.isActive;
  }

  if (filters.categoryId) {
    where.categoryId = filters.categoryId;
  }

  if (filters.published !== undefined) {
    where.publishedToStore = filters.published;
  }

  if (filters.hasDiscount) {
    where.discounts = {
      some: {
        isActive: true,
        validFrom: { lte: new Date() },
        OR: [
          { validTo: null },
          { validTo: { gte: new Date() } },
        ],
      },
    };
  }

  if (filters.variantStatus === "masters") {
    where.masterProductId = null;
    where.childVariants = { some: {} };
  } else if (filters.variantStatus === "variants") {
    where.masterProductId = { not: null };
  } else if (filters.variantStatus === "unlinked") {
    where.masterProductId = null;
    where.childVariants = { none: {} };
    where.variants = { none: {} };
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { sku: { contains: filters.search, mode: "insensitive" } },
      { barcode: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  return where;
}

/**
 * Build Prisma orderBy from filters.
 */
function buildOrderBy(
  filters: ProductFilters
): Record<string, "asc" | "desc"> {
  const fieldMap: Record<string, string> = {
    name: "name",
    sku: "sku",
    createdAt: "createdAt",
    isActive: "isActive",
  };
  const field = fieldMap[filters.sort || "name"] || "name";
  const direction = filters.order === "desc" ? "desc" : "asc";
  return { [field]: direction };
}

/**
 * Get products with filtering and pagination.
 * Server-side only — direct DB access, no HTTP fetch.
 */
export async function getProducts(
  filters: ProductFilters
): Promise<GetProductsResult> {
  const session = await requirePermission("products:read");
  const tenantId = session.tenantId;

  const where = buildWhereClause(filters, tenantId);
  const orderBy = buildOrderBy(filters);
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const skip = (page - 1) * pageSize;
  const now = new Date();

  const [rawProducts, total] = await Promise.all([
    db.product.findMany({
      where,
      include: {
        unit: { select: { id: true, shortName: true } },
        category: { select: { id: true, name: true } },
        masterProduct: { select: { id: true, name: true } },
        // Active purchase price
        purchasePrices: {
          where: {
            isActive: true,
            validFrom: { lte: now },
            OR: [{ validTo: null }, { validTo: { gte: now } }],
          },
          orderBy: { validFrom: "desc" },
          take: 1,
          select: { price: true },
        },
        // Active sale price (default price list)
        salePrices: {
          where: {
            isActive: true,
            priceListId: null,
            validFrom: { lte: now },
            OR: [{ validTo: null }, { validTo: { gte: now } }],
          },
          orderBy: { validFrom: "desc" },
          take: 1,
          select: { price: true },
        },
        // Active discount
        discounts: {
          where: {
            isActive: true,
            validFrom: { lte: now },
            OR: [{ validTo: null }, { validTo: { gte: now } }],
          },
          orderBy: { validFrom: "desc" },
          take: 1,
          select: { name: true, value: true, type: true, validTo: true },
        },
        _count: {
          select: {
            childVariants: true,
            variants: true,
          },
        },
      },
      orderBy,
      skip,
      take: pageSize,
    }),
    db.product.count({ where }),
  ]);

  const items: ProductWithRelations[] = rawProducts.map((p) => {
    const purchasePriceNum = toNumber(p.purchasePrices[0]?.price);
    const purchasePrice = purchasePriceNum > 0 ? purchasePriceNum : null;
    const salePriceNum = toNumber(p.salePrices[0]?.price);
    const salePrice = salePriceNum > 0 ? salePriceNum : null;
    const discount = p.discounts[0] ?? null;
    const discountValue = toNumber(discount?.value);

    // Compute discounted price
    let discountedPrice: number | null = null;
    if (discount && salePrice !== null) {
      if (discount.type === "percentage") {
        discountedPrice = salePrice * (1 - discountValue / 100);
      } else if (discount.type === "fixed") {
        discountedPrice = Math.max(0, salePrice - discountValue);
      }
    }

    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      imageUrl: p.imageUrl,
      isActive: p.isActive,
      publishedToStore: p.publishedToStore,
      createdAt: p.createdAt,
      unit: p.unit,
      category: p.category,
      purchasePrice,
      salePrice,
      discountedPrice,
      discountValidTo: discount?.validTo ?? null,
      discountName: discount?.name ?? null,
      variantCount: p._count.variants,
      childVariantCount: p._count.childVariants,
      masterProductId: p.masterProductId,
      masterProduct: p.masterProduct,
      isMainInGroup: p.isMainInGroup,
      variantGroupName: p.variantGroupName,
    };
  });

  return { items, total, page, pageSize };
}
