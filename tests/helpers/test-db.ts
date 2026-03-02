import { db } from "@/lib/shared/db";

/**
 * Clean all data from the database.
 * Uses TRUNCATE CASCADE to ignore foreign key constraints.
 */
export async function cleanDatabase(): Promise<void> {
  // Use raw SQL TRUNCATE with CASCADE to properly clear all tables
  // This ignores foreign key constraints
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE 
      "OrderItem",
      "Order",
      "OrderCounter",
      "CartItem",
      "Review",
      "Favorite",
      "CustomerAddress",
      "Customer",
      "DocumentItem",
      "Document",
      "DocumentCounter",
      "StockRecord",
      "CounterpartyBalance",
      "CounterpartyInteraction",
      "PurchasePrice",
      "SalePrice",
      "PriceList",
      "ProductCustomField",
      "CustomFieldDefinition",
      "ProductVariant",
      "ProductVariantLink",
      "VariantOption",
      "VariantType",
      "ProductDiscount",
      "SkuCounter",
      "PromoBlock",
      "Integration",
      "StorePage",
      "Product",
      "ProductCategory",
      "Counterparty",
      "Warehouse",
      "Unit",
      "User"
    CASCADE
  `);
}

/**
 * Disconnect from test database.
 */
export async function disconnectTestDb(): Promise<void> {
  await db.$disconnect();
}

/**
 * Get the database client (same as lib/db).
 */
export function getTestDb() {
  return db;
}
