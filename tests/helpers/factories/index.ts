/**
 * Test factories barrel export.
 *
 * Domain-scoped factory modules for test entity creation.
 * Import from this file for backward compatibility.
 */

// Core utilities
export { uniqueId } from "./core";

// Auth domain
export { createTenant, createUser } from "./auth";

// Party domain
export { createParty } from "./party";

// Accounting domain
export {
  createUnit,
  createWarehouse,
  createProduct,
  createCounterparty,
  createDocument,
  createDocumentItem,
  createStockRecord,
  createDocumentWithItems,
  createPriceList,
  seedTestAccounts,
  seedCompanySettings,
  seedReportAccounts,
} from "./accounting";

// Ecommerce domain
export {
  createCustomFieldDefinition,
  createVariantType,
  createVariantOption,
  createProductVariant,
  createProductDiscount,
  createCustomer,
  createStorePage,
  createCartItem,
  createOrder,
  createOrderItem,
  createCategory,
  createSalePrice,
} from "./ecommerce";
