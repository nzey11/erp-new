/**
 * ProductCatalogProjection builder
 *
 * Builds projection data from source tables.
 * Pure logic - no DB mutations.
 *
 * Lifecycle rules:
 * - Product not found → skip
 * - Product deleted → skip (cascade handles it)
 * - Product became child variant (masterProductId != null) → delete
 * - Product hidden (isActive=false, publishedToStore=false) → upsert with flags
 * - Normal product → upsert with full data
 */

import { db } from "@/lib/shared/db";
import type { ProjectionResult, ProductCatalogProjectionData } from "./product-catalog.types";

export async function buildProductCatalogProjection(
  productId: string
): Promise<ProjectionResult> {
  // Load product with all relations needed for projection
  const product = await db.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      slug: true,
      sku: true,
      imageUrl: true,
      description: true,
      categoryId: true,
      unitId: true,
      tenantId: true,
      isActive: true,
      publishedToStore: true,
      masterProductId: true,

      // Unit
      unit: {
        select: { id: true, shortName: true },
      },

      // Category
      category: {
        select: { name: true },
      },

      // Current sale price (priceListId=null, isActive=true, most recent)
      salePrices: {
        where: {
          isActive: true,
          priceListId: null,
        },
        orderBy: { validFrom: "desc" },
        take: 1,
        select: { price: true },
      },

      // Active discount
      discounts: {
        where: {
          isActive: true,
          validFrom: { lte: new Date() },
          OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
        },
        take: 1,
        select: { name: true, type: true, value: true },
      },

      // Published reviews for rating
      reviews: {
        where: { isPublished: true },
        select: { rating: true },
      },

      // Child variants for price range and count
      childVariants: {
        where: {
          isActive: true,
          publishedToStore: true,
        },
        select: {
          id: true,
          salePrices: {
            where: {
              isActive: true,
              priceListId: null,
            },
            orderBy: { validFrom: "desc" },
            take: 1,
            select: { price: true },
          },
        },
      },
    },
  });

  // Case: Product deleted (cascade already handled, or orphaned event)
  if (!product) {
    return { action: "skip" };
  }

  // Case: Product became a child variant - should not be in master list
  if (product.masterProductId !== null) {
    return { action: "delete" };
  }

  // Compute pricing (matches current storefront logic)
  const salePrice = product.salePrices[0]?.price ?? 0;
  const discount = product.discounts[0];

  let discountedPrice: number | null = null;
  if (discount) {
    discountedPrice =
      discount.type === "percentage"
        ? salePrice * (1 - discount.value / 100)
        : salePrice - discount.value;
    discountedPrice = Math.max(0, discountedPrice);
  }

  // Compute rating
  const ratings = product.reviews.map((r) => r.rating);
  const avgRating =
    ratings.length > 0
      ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
      : 0;

  // Compute child variant summary
  const childVariantCount = product.childVariants.length;
  let priceRangeMin: number | null = null;
  let priceRangeMax: number | null = null;

  if (childVariantCount > 0) {
    const allPrices = [salePrice];
    product.childVariants.forEach((cv) => {
      const cvPrice = cv.salePrices[0]?.price;
      if (cvPrice !== undefined) {
        allPrices.push(cvPrice);
      }
    });

    const minVal = Math.min(...allPrices);
    const maxVal = Math.max(...allPrices);
    if (minVal !== maxVal) {
      priceRangeMin = minVal;
      priceRangeMax = maxVal;
    }
  }

  const data: ProductCatalogProjectionData = {
    productId: product.id,
    tenantId: product.tenantId,

    name: product.name,
    slug: product.slug,
    sku: product.sku,
    imageUrl: product.imageUrl,
    description: product.description,

    unitId: product.unit?.id ?? null,
    unitShortName: product.unit?.shortName ?? null,

    categoryId: product.categoryId,
    categoryName: product.category?.name ?? null,

    price: salePrice,
    discountedPrice,
    discountName: discount?.name ?? null,
    discountType: discount?.type ?? null,
    discountValue: discount?.value ?? null,

    avgRating: Math.round(avgRating * 10) / 10,
    reviewCount: ratings.length,

    childVariantCount,
    priceRangeMin,
    priceRangeMax,

    isActive: product.isActive,
    publishedToStore: product.publishedToStore,
  };

  return { action: "upsert", data };
}
