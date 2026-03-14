/**
 * E-commerce handler — Product Catalog Projection
 *
 * Reacts to product/price/discount changes by updating ProductCatalogProjection.
 * All three events use the same handler: read current state → upsert/delete projection.
 */

import type {
  ProductUpdatedEvent,
  SalePriceUpdatedEvent,
  DiscountUpdatedEvent,
} from "@/lib/events";
import { updateProductCatalogProjection } from "../projections";

/**
 * Handler for product.updated event.
 * Updates storefront catalog projection for the changed product.
 */
export async function onProductCatalogUpdated(
  event: ProductUpdatedEvent | SalePriceUpdatedEvent | DiscountUpdatedEvent
): Promise<void> {
  const { productId } = event.payload;
  await updateProductCatalogProjection(productId);
}
