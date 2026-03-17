import 'dotenv/config'
import { db } from '../lib/shared/db'

// ⚠️  After running this script:
// 1. Create warehouse manually via UI (/warehouses → "Добавить склад")
// 2. Units (шт, кг etc.) are preserved automatically — do NOT delete them
// 3. Chart of accounts is preserved automatically
// 4. Finance categories are preserved automatically

async function cleanAllData() {
  console.log('🧹 Cleaning all data...')

  // Events & outbox (no FK deps)
  await db.outboxEvent.deleteMany()
  await db.processedWebhook.deleteMany()
  console.log('✓ OutboxEvent, ProcessedWebhook')

  // E-commerce leaf nodes
  await db.cartItem.deleteMany()
  await db.review.deleteMany()
  await db.favorite.deleteMany()
  await db.orderItem.deleteMany()
  await db.order.deleteMany()
  await db.orderCounter.deleteMany()
  await db.customerAddress.deleteMany()
  await db.customer.deleteMany()
  console.log('✓ E-commerce (Customer, Order, Cart, Reviews, Favorites)')

  // Finance: ledger lines are cascade-deleted with journalEntry
  await db.journalEntry.deleteMany()
  await db.journalCounter.deleteMany()
  await db.payment.deleteMany()
  await db.paymentCounter.deleteMany()
  await db.financeCategory.deleteMany()
  console.log('✓ Finance (JournalEntry/LedgerLine, Payment, FinanceCategory)')

  // Documents & Stock
  await db.stockMovement.deleteMany()
  await db.stockRecord.deleteMany()
  await db.documentItem.deleteMany()
  await db.document.deleteMany()
  await db.documentCounter.deleteMany()
  console.log('✓ Documents & Stock')

  // CRM / Party
  await db.partyActivity.deleteMany()
  await db.partyOwner.deleteMany()
  await db.mergeRequest.deleteMany()
  await db.partyLink.deleteMany()
  await db.party.deleteMany()
  console.log('✓ Party / CRM')

  // Counterparty (after documents/payments/party)
  await db.counterpartyBalance.deleteMany()
  await db.counterpartyInteraction.deleteMany()
  await db.counterparty.deleteMany()
  console.log('✓ Counterparty')

  // Warehouse (after stock)
  await db.warehouse.deleteMany()
  console.log('✓ Warehouse')

  // Product catalog (prices/variants before products)
  await db.purchasePrice.deleteMany()
  await db.salePrice.deleteMany()
  await db.priceList.deleteMany()
  await db.productCustomField.deleteMany()
  await db.customFieldDefinition.deleteMany()
  await db.productVariantLink.deleteMany()
  await db.productVariant.deleteMany()
  await db.variantOption.deleteMany()
  await db.variantType.deleteMany()
  await db.productDiscount.deleteMany()
  await db.productCatalogProjection.deleteMany()
  await db.skuCounter.deleteMany()
  await db.product.deleteMany()
  await db.productCategory.deleteMany()
  // Unit — global reference (no tenantId), shared across all tenants.
  // Do NOT delete — шт, кг, г, л, м, уп, кор, пар must be preserved.
  // await db.unit.deleteMany()  ← intentionally disabled
  console.log('✓ Product Catalog')

  // CMS / store content (no critical deps)
  await db.promoBlock.deleteMany()
  await db.storePage.deleteMany()
  console.log('✓ CMS (PromoBlock, StorePage)')

  // Verify what was kept
  const counts = {
    products: await db.product.count(),
    documents: await db.document.count(),
    counterparties: await db.counterparty.count(),
    payments: await db.payment.count(),
    stockRecords: await db.stockRecord.count(),
    accounts: await db.account.count(),       // must be > 0
    tenants: await db.tenant.count(),          // must be > 0
    users: await db.user.count(),              // must be > 0
  }

  console.log('\n📊 Verification:')
  console.log('Products        :', counts.products,      '(should be 0)')
  console.log('Documents       :', counts.documents,     '(should be 0)')
  console.log('Counterparties  :', counts.counterparties,'(should be 0)')
  console.log('Payments        :', counts.payments,      '(should be 0)')
  console.log('StockRecords    :', counts.stockRecords,  '(should be 0)')
  console.log('Accounts        :', counts.accounts,      '(should be > 0 — preserved)')
  console.log('Tenants         :', counts.tenants,       '(should be > 0 — preserved)')
  console.log('Users           :', counts.users,         '(should be > 0 — admin preserved)')

  await db.$disconnect()
  console.log('\n✅ Done! Database is clean.')
}

cleanAllData().catch(console.error)
