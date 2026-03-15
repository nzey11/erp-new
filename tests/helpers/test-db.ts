import { db } from "@/lib/shared/db";

/**
 * Clean all data from the database.
 * Uses deleteMany in dependency order (children before parents).
 * Note: $executeRawUnsafe is not supported with PrismaPg adapter.
 */
export async function cleanDatabase(): Promise<void> {
  // Delete in reverse FK dependency order
  // Note: Order/OrderItem/OrderCounter are legacy - Document is used now
  await db.cartItem.deleteMany();
  await db.review.deleteMany();
  await db.favorite.deleteMany();
  await db.customerAddress.deleteMany();
  await db.customer.deleteMany();
  // Journal entries before stock/document tables
  // Note: onDelete: Cascade on LedgerLine.entryId → cascade-deletes LedgerLine rows
  await db.journalEntry.deleteMany();
  // Note: CompanySettings is deprecated; TenantSettings is cleaned below with Tenant cascade
  await db.stockMovement.deleteMany(); // Stock movements before document items
  await db.documentItem.deleteMany();
  await db.document.deleteMany();
  await db.documentCounter.deleteMany();
  await db.stockRecord.deleteMany();
  await db.counterpartyBalance.deleteMany();
  await db.counterpartyInteraction.deleteMany();
  // Party-related tables (order matters: activities/owners before parties)
  await db.partyActivity.deleteMany();
  await db.partyOwner.deleteMany();
  await db.partyLink.deleteMany();
  await db.party.deleteMany();
  await db.purchasePrice.deleteMany();
  await db.salePrice.deleteMany();
  await db.priceList.deleteMany();
  await db.productCustomField.deleteMany();
  await db.customFieldDefinition.deleteMany();
  await db.productVariantLink.deleteMany();
  await db.productVariant.deleteMany();
  await db.variantOption.deleteMany();
  await db.variantType.deleteMany();
  await db.productDiscount.deleteMany();
  await db.skuCounter.deleteMany();
  await db.promoBlock.deleteMany();
  await db.integration.deleteMany();
  await db.storePage.deleteMany();
  await db.product.deleteMany();
  await db.productCategory.deleteMany();
  await db.counterparty.deleteMany();
  await db.warehouse.deleteMany();
  await db.tenantSettings.deleteMany();
  await db.tenantMembership.deleteMany();
  await db.tenant.deleteMany();
  await db.unit.deleteMany();
  // Delete users last (after memberships)
  await db.user.deleteMany();
}

/**
 * Clean only journal-related tables (LedgerLine via cascade, JournalEntry).
 * Useful in beforeEach of journal test suites when full cleanDatabase() is overkill.
 */
export async function cleanJournal(): Promise<void> {
  // LedgerLine is cascade-deleted when JournalEntry is deleted
  await db.journalEntry.deleteMany();
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
