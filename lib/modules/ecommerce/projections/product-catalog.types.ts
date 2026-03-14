/**
 * ProductCatalogProjection types
 *
 * Phase 1 storefront catalog list read model.
 */

export type ProductCatalogProjectionData = {
  productId: string;
  tenantId: string;

  // Identity
  name: string;
  slug: string | null;
  sku: string | null;
  imageUrl: string | null;
  description: string | null;

  // Unit (denormalized)
  unitId: string | null;
  unitShortName: string | null;

  // Category (denormalized)
  categoryId: string | null;
  categoryName: string | null;

  // Pricing (current storefront logic)
  price: number;
  discountedPrice: number | null;
  discountName: string | null;
  discountType: string | null;
  discountValue: number | null;

  // Rating (aggregated)
  avgRating: number;
  reviewCount: number;

  // Variant summary (lightweight)
  childVariantCount: number;
  priceRangeMin: number | null;
  priceRangeMax: number | null;

  // State
  isActive: boolean;
  publishedToStore: boolean;
};

/**
 * Result of building a projection row.
 *
 * - upsert: Product should be visible in projection (normal or hidden)
 * - delete: Product became a child variant, remove from projection
 * - skip: Product deleted or not found, nothing to do
 */
export type ProjectionResult =
  | { action: "upsert"; data: ProductCatalogProjectionData }
  | { action: "delete" }
  | { action: "skip" };
