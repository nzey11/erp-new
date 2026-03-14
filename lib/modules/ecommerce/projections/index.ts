/**
 * ProductCatalogProjection module
 *
 * Storefront catalog list read model.
 *
 * Usage:
 * - updateProductCatalogProjection(productId) - called by outbox handlers
 * - buildProductCatalogProjection(productId) - pure builder, for testing
 */

export {
  updateProductCatalogProjection,
  deleteProductCatalogProjection,
} from "./product-catalog.projection";

export { buildProductCatalogProjection } from "./product-catalog.builder";

export type {
  ProductCatalogProjectionData,
  ProjectionResult,
} from "./product-catalog.types";
