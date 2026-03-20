/**
 * API route for cleaning business/transactional data.
 * Only available in non-production environments.
 *
 * PRESERVED (not deleted):
 *   - Tenant + Users (admin)
 *   - Unit (шт, кг, г, л, м, уп, кор, пар)
 *   - Warehouse (warehouses created via UI)
 *   - FinanceCategory
 *   - Account (chart of accounts / план счетов)
 *   - TenantSettings
 */

import { NextResponse } from 'next/server'
import { db } from '@/lib/shared/db'

async function cleanBusinessData() {
  // Events & outbox
  await db.outboxEvent.deleteMany()
  await db.processedWebhook.deleteMany()

  // CRM / Party
  await db.partyActivity.deleteMany()
  await db.partyOwner.deleteMany()
  await db.mergeRequest.deleteMany()
  await db.partyLink.deleteMany()
  await db.party.deleteMany()

  // Accounting: Journal & Ledger (before Documents)
  await db.ledgerLine.deleteMany()
  await db.journalEntry.deleteMany()
  await db.journalCounter.updateMany({ data: { lastNumber: 0 } })

  // Finance Payments
  await db.payment.deleteMany()
  await db.paymentCounter.updateMany({ data: { lastNumber: 0 } })

  // E-commerce
  await db.review.deleteMany()
  await db.cartItem.deleteMany()
  await db.favorite.deleteMany()
  await db.orderItem.deleteMany()
  await db.order.deleteMany()
  await db.customerAddress.deleteMany()
  await db.customer.deleteMany()

  // Stock & Documents
  await db.stockMovement.deleteMany()
  await db.stockRecord.deleteMany()
  await db.documentItem.deleteMany()
  await db.document.deleteMany()
  await db.documentCounter.updateMany({ data: { lastNumber: 0 } })

  // Counterparties & Balances
  await db.counterpartyBalance.deleteMany()
  await db.counterparty.deleteMany()

  // Product Catalog
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
}

export async function POST() {
  // Block in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Not available in production' },
      { status: 403 }
    )
  }

  try {
    await cleanBusinessData()
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Clean data error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
