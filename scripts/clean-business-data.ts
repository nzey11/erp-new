/**
 * scripts/clean-business-data.ts
 *
 * Cleans all business/transactional data from the database.
 * Preserves manually configured reference data.
 *
 * PRESERVED (not deleted):
 *   - Tenant + Users (admin)
 *   - Unit        (шт, кг, г, л, м, уп, кор, пар)
 *   - Warehouse   (warehouses created via UI)
 *   - FinanceCategory
 *   - Account     (chart of accounts / план счетов)
 *   - TenantSettings
 *
 * Usage: npx tsx --env-file=.env scripts/clean-business-data.ts
 */

import { db } from '../lib/shared/db'

async function cleanBusinessData() {
  console.log('🧹 Cleaning business data...')
  console.log('(Units, Warehouses, FinanceCategories, Accounts, Users preserved)\n')

  // ── Events & outbox ────────────────────────────────────────────────────────
  await db.outboxEvent.deleteMany()
  await db.processedWebhook.deleteMany()
  console.log('✓ Events & outbox cleared')

  // ── CRM / Party ───────────────────────────────────────────────────────────
  await db.partyActivity.deleteMany()
  await db.partyOwner.deleteMany()
  await db.mergeRequest.deleteMany()
  await db.partyLink.deleteMany()
  await db.party.deleteMany()
  console.log('✓ CRM / Party cleared')

  // ── Accounting: Journal & Ledger ─────────────────────────────────────────
  // Must come before Documents (journal entries reference documents via sourceId)
  await db.ledgerLine.deleteMany()
  await db.journalEntry.deleteMany()
  // Reset journal number counter so next entries start fresh
  await db.journalCounter.updateMany({ data: { lastNumber: 0 } })
  console.log('✓ Journal & Ledger cleared')

  // ── Finance Payments ──────────────────────────────────────────────────────
  await db.payment.deleteMany()
  // Reset payment counter
  await db.paymentCounter.updateMany({ data: { lastNumber: 0 } })
  console.log('✓ Payments cleared')

  // ── E-commerce ────────────────────────────────────────────────────────────
  await db.review.deleteMany()
  await db.cartItem.deleteMany()
  await db.favorite.deleteMany()
  await db.orderItem.deleteMany()
  await db.order.deleteMany()
  await db.customerAddress.deleteMany()
  await db.customer.deleteMany()
  console.log('✓ E-commerce cleared')

  // ── Stock & Documents ─────────────────────────────────────────────────────
  await db.stockMovement.deleteMany()
  await db.stockRecord.deleteMany()
  await db.documentItem.deleteMany()
  await db.document.deleteMany()
  // Reset document counter
  await db.documentCounter.updateMany({ data: { lastNumber: 0 } })
  console.log('✓ Documents & Stock cleared')

  // ── Counterparties & Balances ─────────────────────────────────────────────
  // CounterpartyBalance must come before Counterparty (FK)
  await db.counterpartyBalance.deleteMany()
  await db.counterparty.deleteMany()
  console.log('✓ Counterparties cleared')

  // ── Product Catalog ───────────────────────────────────────────────────────
  // Deletion order follows FK dependencies:
  //   ProductCatalogProjection → ProductCustomField → ProductVariantLink
  //   → ProductVariant → VariantOption → VariantType → CustomFieldDefinition
  //   → SalePrice → PurchasePrice → PriceList → Product → ProductCategory
  await db.productCatalogProjection.deleteMany()
  await db.productCustomField.deleteMany()
  await db.productVariantLink.deleteMany()
  await db.productVariant.deleteMany()
  await db.variantOption.deleteMany()
  await db.variantType.deleteMany()
  await db.customFieldDefinition.deleteMany()
  await db.salePrice.deleteMany()
  await db.purchasePrice.deleteMany()
  await db.priceList.deleteMany()
  await db.product.deleteMany()
  await db.productCategory.deleteMany()
  console.log('✓ Product catalog cleared')

  // ── Verification ──────────────────────────────────────────────────────────
  console.log('\n📊 Verification:')

  const [
    productCount, documentCount, counterpartyCount,
    paymentCount, stockCount, journalCount,
  ] = await Promise.all([
    db.product.count(),
    db.document.count(),
    db.counterparty.count(),
    db.payment.count(),
    db.stockRecord.count(),
    db.journalEntry.count(),
  ])

  console.log(`Products:      ${productCount}    (should be 0)`)
  console.log(`Documents:     ${documentCount}    (should be 0)`)
  console.log(`Counterparties:${counterpartyCount}    (should be 0)`)
  console.log(`Payments:      ${paymentCount}    (should be 0)`)
  console.log(`StockRecords:  ${stockCount}    (should be 0)`)
  console.log(`JournalEntries:${journalCount}    (should be 0)`)

  console.log('\n--- Preserved ---')
  const [
    unitCount, warehouseCount, categoryCount, accountCount, userCount,
  ] = await Promise.all([
    db.unit.count(),
    db.warehouse.count(),
    db.financeCategory.count(),
    db.account.count(),
    db.user.count(),
  ])

  console.log(`Units:            ${unitCount}  (should be > 0)`)
  console.log(`Warehouses:       ${warehouseCount}  (should be > 0)`)
  console.log(`FinanceCategories:${categoryCount}  (should be > 0)`)
  console.log(`Accounts:         ${accountCount}  (should be > 0)`)
  console.log(`Users:            ${userCount}  (should be > 0)`)

  const allClear =
    productCount === 0 &&
    documentCount === 0 &&
    counterpartyCount === 0 &&
    paymentCount === 0 &&
    stockCount === 0 &&
    journalCount === 0

  const allPreserved =
    unitCount > 0 &&
    warehouseCount > 0 &&
    categoryCount > 0 &&
    accountCount > 0 &&
    userCount > 0

  await db.$disconnect()

  if (allClear && allPreserved) {
    console.log('\n✅ Done! Database cleaned. Ready for fresh manual testing.')
  } else {
    console.error('\n❌ Verification failed — check counts above.')
    process.exit(1)
  }
}

cleanBusinessData().catch((e) => {
  console.error('✗ Fatal error:', e)
  process.exit(1)
})
