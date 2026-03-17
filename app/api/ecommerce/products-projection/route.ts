/**
 * GET /api/ecommerce/products-projection
 *
 * Public product listing from projection table.
 * Optimized read path for storefront catalog.
 *
 * Same API contract as /api/ecommerce/products for easy migration.
 *
 * Query params:
 * - compare=true: Enable dual-read comparison mode (returns diff report)
 */

import { NextRequest, NextResponse } from "next/server";
import { db, toNumber } from "@/lib/shared/db";
import { parseQuery, validationError } from "@/lib/shared/validation";
import { queryStorefrontProductsSchema } from "@/lib/modules/ecommerce/schemas/products.schema";
import { logger } from "@/lib/shared/logger";

// Fields to compare strictly in compare mode
const STRICT_COMPARE_FIELDS = [
  "name",
  "slug",
  "sku",
  "description",
  "price",
  "discountedPrice",
  "rating",
  "reviewCount",
  "childVariantCount",
] as const;

/** GET /api/ecommerce/products-projection — Public product listing from projection */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const compareMode = url.searchParams.get("compare") === "true";

    const { search, categoryId, minPrice, maxPrice, page = 1, limit = 20, sort } = parseQuery(
      request,
      queryStorefrontProductsSchema
    );

    // Build where clause for projection
    const where: Record<string, unknown> = {
      isActive: true,
      publishedToStore: true,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { sku: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    // Build orderBy
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let orderBy: any = { name: "asc" };
    if (sort === "newest") orderBy = { updatedAt: "desc" };
    if (sort === "price_asc" || sort === "price_desc") orderBy = { name: "asc" }; // Sort after fetch for price

    // Query projection table
    const [projections, total] = await Promise.all([
      db.productCatalogProjection.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.productCatalogProjection.count({ where }),
    ]);

    // Batched lookup for variants (separate from projection)
    const productIds = projections.map((p) => p.productId);
    const variants = await db.productVariant.findMany({
      where: {
        productId: { in: productIds },
        isActive: true,
      },
      include: {
        option: {
          include: { variantType: { select: { id: true, name: true } } },
        },
      },
    });

    // Group variants by productId
    const variantsByProduct = new Map<string, typeof variants>();
    for (const v of variants) {
      const existing = variantsByProduct.get(v.productId) ?? [];
      existing.push(v);
      variantsByProduct.set(v.productId, existing);
    }

    // Map to storefront-friendly format (same contract as original endpoint)
    const data = projections.map((p) => {
      const productVariants = variantsByProduct.get(p.productId) ?? [];

      return {
        id: p.productId,
        name: p.name,
        slug: p.slug,
        sku: p.sku,
        description: p.description,
        imageUrl: p.imageUrl,
        unit: p.unitId && p.unitShortName
          ? { id: p.unitId, shortName: p.unitShortName }
          : null,
        category: p.categoryId && p.categoryName
          ? { id: p.categoryId, name: p.categoryName }
          : null,
        price: p.price,
        discountedPrice: p.discountedPrice,
        discount: p.discountName && p.discountType && p.discountValue !== null
          ? { name: p.discountName, type: p.discountType, value: p.discountValue }
          : null,
        rating: p.avgRating,
        reviewCount: p.reviewCount,
        variants: productVariants.map((v) => ({
          id: v.id,
          sku: v.sku,
          priceAdjustment: v.priceAdjustment,
          option: v.option.value,
          type: v.option.variantType.name,
        })),
        childVariantCount: p.childVariantCount,
        priceRange: p.priceRangeMin !== null && p.priceRangeMax !== null
          ? { min: p.priceRangeMin, max: p.priceRangeMax }
          : null,
        seoTitle: null, // Not in projection Phase 1
        seoDescription: null, // Not in projection Phase 1
      };
    });

    // Price filtering (post-fetch since price is in projection)
    let filtered = data;
    if (minPrice !== undefined) filtered = filtered.filter((p) => (toNumber(p.discountedPrice) || toNumber(p.price)) >= minPrice);
    if (maxPrice !== undefined) filtered = filtered.filter((p) => (toNumber(p.discountedPrice) || toNumber(p.price)) <= maxPrice);

    // Price sorting (post-fetch)
    if (sort === "price_asc") filtered.sort((a, b) => (toNumber(a.discountedPrice) || toNumber(a.price)) - (toNumber(b.discountedPrice) || toNumber(b.price)));
    if (sort === "price_desc") filtered.sort((a, b) => (toNumber(b.discountedPrice) || toNumber(b.price)) - (toNumber(a.discountedPrice) || toNumber(a.price)));

    // Compare mode: dual-read and return diff report
    if (compareMode) {
      const diffReport = await compareWithOriginal(filtered, where, orderBy, page, limit);
      return NextResponse.json(diffReport);
    }

    return NextResponse.json({ data: filtered, total, page, limit });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    logger.error("ecommerce-products-projection", "Failed to fetch products from projection", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

/**
 * Compare projection data with original query.
 * Returns diff report for dual-read verification.
 */
async function compareWithOriginal(
  projectionData: Record<string, unknown>[],
  where: Record<string, unknown>,
  orderBy: Record<string, unknown>,
  page: number,
  limit: number
) {
  // Query original source (same as /api/ecommerce/products)
  const originalProducts = await db.product.findMany({
    where: {
      ...where,
      masterProductId: null,
    },
    include: {
      unit: { select: { id: true, shortName: true } },
      category: { select: { id: true, name: true } },
      salePrices: {
        where: { isActive: true, priceListId: null },
        orderBy: { validFrom: "desc" },
        take: 1,
      },
      discounts: {
        where: {
          isActive: true,
          validFrom: { lte: new Date() },
          OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
        },
        take: 1,
      },
      reviews: { where: { isPublished: true }, select: { rating: true } },
      variants: {
        where: { isActive: true },
        include: { option: { include: { variantType: { select: { name: true } } } } },
      },
      childVariants: {
        where: { isActive: true, publishedToStore: true },
        select: {
          id: true,
          salePrices: {
            where: { isActive: true, priceListId: null },
            orderBy: { validFrom: "desc" },
            take: 1,
            select: { price: true },
          },
        },
      },
    },
    orderBy,
    skip: (page - 1) * limit,
    take: limit,
  });

  // Map original to comparable format
  const originalData = originalProducts.map((p) => {
    const salePrice = toNumber(p.salePrices[0]?.price) ?? 0;
    const discount = p.discounts[0];
    let discountedPrice: number | null = null;
    if (discount) {
      discountedPrice =
        discount.type === "percentage"
          ? salePrice * (1 - toNumber(discount.value) / 100)
          : salePrice - toNumber(discount.value);
      discountedPrice = Math.max(0, discountedPrice);
    }

    const ratings = p.reviews.map((r) => r.rating);
    const avgRating =
      ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : 0;

    const childVariantCount = p.childVariants.length;
    let priceRange: { min: number; max: number } | null = null;
    if (childVariantCount > 0) {
      const allPrices = [salePrice, ...p.childVariants.map((cv) => toNumber(cv.salePrices[0]?.price)).filter(Boolean) as number[]];
      const minVal = Math.min(...allPrices);
      const maxVal = Math.max(...allPrices);
      if (minVal !== maxVal) priceRange = { min: minVal, max: maxVal };
    }

    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      sku: p.sku,
      description: p.description,
      unit: p.unit ? { id: p.unit.id, shortName: p.unit.shortName } : null,
      category: p.category ? { id: p.category.id, name: p.category.name } : null,
      price: salePrice,
      discountedPrice,
      discount: discount ? { name: discount.name, type: discount.type, value: discount.value } : null,
      rating: Math.round(avgRating * 10) / 10,
      reviewCount: ratings.length,
      variants: p.variants.map((v) => ({ id: v.id })),
      childVariantCount,
      priceRange,
    };
  });

  // Compare
  const diffs: Array<{ id: string; field: string; old: unknown; new: unknown }> = [];
  const projectionById = new Map(projectionData.map((p) => [p.id as string, p]));
  const originalById = new Map(originalData.map((p) => [p.id, p]));

  for (const [id, original] of originalById) {
    const projection = projectionById.get(id);
    if (!projection) {
      diffs.push({ id, field: "_missing", old: "exists", new: "missing" });
      continue;
    }

    for (const field of STRICT_COMPARE_FIELDS) {
      if (original[field] !== projection[field]) {
        diffs.push({ id, field, old: original[field], new: projection[field] });
      }
    }

    // Compare unit
    if (JSON.stringify(original.unit) !== JSON.stringify(projection.unit)) {
      diffs.push({ id, field: "unit", old: original.unit, new: projection.unit });
    }

    // Compare category
    if (JSON.stringify(original.category) !== JSON.stringify(projection.category)) {
      diffs.push({ id, field: "category", old: original.category, new: projection.category });
    }

    // Compare discount
    if (JSON.stringify(original.discount) !== JSON.stringify(projection.discount)) {
      diffs.push({ id, field: "discount", old: original.discount, new: projection.discount });
    }

    // Compare variants (as sets)
    const oldVariantIds = original.variants.map((v: { id: string }) => v.id).sort().join(",");
    const newVariantIds = ((projection.variants as Array<{ id: string }>) ?? []).map((v) => v.id).sort().join(",");
    if (oldVariantIds !== newVariantIds) {
      diffs.push({ id, field: "variants", old: original.variants.length, new: (projection.variants as unknown[])?.length ?? 0 });
    }
  }

  return {
    match: diffs.length === 0,
    projectionCount: projectionData.length,
    originalCount: originalData.length,
    diffs: diffs.slice(0, 20), // Limit to first 20 diffs
    totalDiffs: diffs.length,
  };
}
