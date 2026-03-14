/**
 * ProductCatalogProjection orchestration
 *
 * Updates projection based on builder result.
 * Called by outbox handlers for:
 * - product.updated
 * - sale_price.updated
 * - discount.updated
 */

import { db } from "@/lib/shared/db";
import { buildProductCatalogProjection } from "./product-catalog.builder";

/**
 * Update ProductCatalogProjection for a given product.
 *
 * Lifecycle:
 * - Product deleted → skip (cascade handled by DB)
 * - Product became child variant → delete projection row
 * - Product hidden → update flags, keep row
 * - Normal → full upsert
 */
export async function updateProductCatalogProjection(
  productId: string
): Promise<void> {
  const result = await buildProductCatalogProjection(productId);

  switch (result.action) {
    case "upsert":
      await db.productCatalogProjection.upsert({
        where: { productId },
        create: result.data,
        update: result.data,
      });
      break;

    case "delete":
      await db.productCatalogProjection
        .delete({ where: { productId } })
        .catch(() => {
          // Ignore if row doesn't exist
        });
      break;

    case "skip":
      // Nothing to do
      break;
  }
}

/**
 * Delete a projection row directly.
 * Used when product is hard-deleted (though cascade should handle it).
 */
export async function deleteProductCatalogProjection(
  productId: string
): Promise<void> {
  await db.productCatalogProjection
    .delete({ where: { productId } })
    .catch(() => {
      // Ignore if row doesn't exist
    });
}
