/**
 * scripts/recalculate-all.ts
 *
 * Post-bugfix data recalculation script.
 * Recalculates all derived/cached data from authoritative sources.
 * Safe to run multiple times — all operations are idempotent.
 *
 * Usage: npx tsx scripts/recalculate-all.ts
 *
 * What it recalculates:
 *   1. CounterpartyBalance   — from confirmed documents (all counterparties)
 *   2. StockRecord.quantity  — from StockMovements (all product×warehouse pairs)
 *   3. ProductCatalogProjection — from Product/SalePrice/Discount tables
 *   4. Missing JournalEntries — auto-post any confirmed docs that lack entries
 *   5. Double-entry check     — SUM(debit) == SUM(credit) verification
 *
 * NOTE: AVCO (averageCost) is NOT recalculated here.
 * AVCO is path-dependent (order matters) and was not changed by the bug fixes.
 * It remains correct as long as the confirm flow was not replayed.
 */

import { db } from '@/lib/shared/db'
import { recalculateBalance } from '@/lib/modules/accounting/services/balance.service'
import { reconcileStockRecord } from '@/lib/modules/accounting/inventory/stock-movements'
import { updateProductCatalogProjection } from '@/lib/modules/ecommerce/projections/product-catalog.projection'
import { autoPostDocument } from '@/lib/modules/accounting/finance/journal'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0
  return typeof v === 'number' ? v : Number(v)
}

// ─── Step 1: CounterpartyBalance ──────────────────────────────────────────────

async function recalculateCounterpartyBalances(): Promise<number> {
  console.log('\n[1] Пересчёт CounterpartyBalance...')
  const counterparties = await db.counterparty.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  let count = 0
  for (const cp of counterparties) {
    try {
      const balance = await recalculateBalance(cp.id)
      if (balance !== 0) {
        console.log(`  ✓ ${cp.name}: ${balance > 0 ? '+' : ''}${balance.toFixed(2)} руб`)
      }
      count++
    } catch (e: unknown) {
      console.error(`  ✗ Ошибка для ${cp.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  console.log(`  → ${count} контрагентов пересчитано`)
  return count
}

// ─── Step 2: StockRecord reconciliation ───────────────────────────────────────

async function reconcileAllStockRecords(): Promise<number> {
  console.log('\n[2] Пересчёт StockRecord из движений...')

  // Get all unique (productId, warehouseId) pairs that have movements
  const pairs = await db.stockMovement.groupBy({
    by: ['productId', 'warehouseId'],
  })

  let count = 0
  let mismatches = 0

  for (const pair of pairs) {
    try {
      // Get current StockRecord before reconciliation
      const before = await db.stockRecord.findUnique({
        where: { warehouseId_productId: { warehouseId: pair.warehouseId, productId: pair.productId } },
      })
      const beforeQty = toNum(before?.quantity)

      const newQty = await reconcileStockRecord(pair.productId, pair.warehouseId)

      if (Math.abs(newQty - beforeQty) > 0.001) {
        console.log(
          `  ⚠ Скорректировано productId=${pair.productId} wh=${pair.warehouseId}: ${beforeQty} → ${newQty}`
        )
        mismatches++
      }
      count++
    } catch (e: unknown) {
      console.error(
        `  ✗ Ошибка для product=${pair.productId}: ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }

  console.log(`  → ${count} пар (productId, warehouseId) пересчитано, ${mismatches} скорректировано`)
  return count
}

// ─── Step 3: ProductCatalogProjection ─────────────────────────────────────────

async function rebuildProductProjections(): Promise<number> {
  console.log('\n[3] Перестройка ProductCatalogProjection...')

  // All non-variant products (master products only)
  const products = await db.product.findMany({
    where: { masterProductId: null },
    select: { id: true, name: true, isActive: true, publishedToStore: true },
    orderBy: { name: 'asc' },
  })

  let count = 0
  for (const product of products) {
    try {
      await updateProductCatalogProjection(product.id)
      count++
    } catch (e: unknown) {
      console.error(
        `  ✗ Ошибка для ${product.name}: ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }

  const projectionCount = await db.productCatalogProjection.count()
  console.log(`  → Обновлено ${count} продуктов, в проекции ${projectionCount} строк`)
  return count
}

// ─── Step 4: Missing JournalEntries ───────────────────────────────────────────

const JOURNAL_DOCUMENT_TYPES = [
  'incoming_shipment',
  'outgoing_shipment',
  'incoming_payment',
  'outgoing_payment',
  'customer_return',
  'supplier_return',
  'stock_receipt',
  'write_off',
] as const

async function createMissingJournalEntries(): Promise<number> {
  console.log('\n[4] Поиск документов без журнальных проводок...')

  // JournalEntry links to Document via sourceId (plain string, no FK)
  // We must cross-reference manually
  const confirmedDocs = await db.document.findMany({
    where: {
      status: 'confirmed',
      type: { in: [...JOURNAL_DOCUMENT_TYPES] },
    },
    select: { id: true, number: true, type: true, date: true },
    orderBy: { date: 'asc' },
  })

  // Get all sourceIds that already have journal entries (non-reversed)
  const existingEntries = await db.journalEntry.findMany({
    where: {
      sourceId: { in: confirmedDocs.map((d) => d.id) },
      isReversed: false,
    },
    select: { sourceId: true },
  })
  const postedSourceIds = new Set(existingEntries.map((e) => e.sourceId))

  const docsWithoutJournal = confirmedDocs.filter((d) => !postedSourceIds.has(d.id))

  if (docsWithoutJournal.length === 0) {
    console.log('  ✓ Все подтверждённые документы имеют проводки')
    return 0
  }

  console.log(`  ! Найдено ${docsWithoutJournal.length} документов без проводок — создаём...`)

  let created = 0
  let skipped = 0

  for (const doc of docsWithoutJournal) {
    try {
      await autoPostDocument(doc.id, doc.number, doc.date)
      console.log(`  ✓ Проводка создана: ${doc.number} (${doc.type})`)
      created++
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      // Some document types have no posting rules — that's expected
      if (msg.includes('not found') || msg.includes('Account')) {
        console.warn(`  ⚠ Пропущен ${doc.number} (${doc.type}): ${msg}`)
        skipped++
      } else {
        console.error(`  ✗ Ошибка для ${doc.number}: ${msg}`)
      }
    }
  }

  console.log(`  → Создано ${created} проводок, пропущено ${skipped}`)
  return created
}

// ─── Step 5: Double-entry balance check ───────────────────────────────────────

async function verifyDoubleEntryBalance(): Promise<boolean> {
  console.log('\n[5] Проверка баланса двойной записи...')

  const agg = await db.ledgerLine.aggregate({
    _sum: { debit: true, credit: true },
  })

  const totalDebit = toNum(agg._sum.debit)
  const totalCredit = toNum(agg._sum.credit)
  const diff = Math.abs(totalDebit - totalCredit)
  const balanced = diff < 0.01

  console.log(`  Дебет:  ${totalDebit.toFixed(2)}`)
  console.log(`  Кредит: ${totalCredit.toFixed(2)}`)
  console.log(`  Разница: ${diff.toFixed(4)}`)
  console.log(balanced ? '  ✓ БАЛАНС СХОДИТСЯ' : '  ✗ БАЛАНС НЕ СХОДИТСЯ — требуется ревизия')

  return balanced
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== recalculate-all.ts ===')
  console.log('Пересчёт всех производных данных после исправления финансовых багов.')
  console.log('Все операции идемпотентны — безопасно запускать повторно.\n')

  const startAt = Date.now()

  const cpCount   = await recalculateCounterpartyBalances()
  const stockCount = await reconcileAllStockRecords()
  const projCount  = await rebuildProductProjections()
  const jeCount    = await createMissingJournalEntries()
  const balanced   = await verifyDoubleEntryBalance()

  const elapsed = ((Date.now() - startAt) / 1000).toFixed(1)

  console.log('\n=== ИТОГ ===')
  console.log(`  CounterpartyBalance:       ${cpCount} пересчитано`)
  console.log(`  StockRecord:               ${stockCount} пар reconciled`)
  console.log(`  ProductCatalogProjection:  ${projCount} продуктов обновлено`)
  console.log(`  JournalEntry (пропущенных):${jeCount} создано`)
  console.log(`  Двойная запись:            ${balanced ? '✅ сходится' : '❌ НЕ СХОДИТСЯ'}`)
  console.log(`  Время:                     ${elapsed}s`)

  if (!balanced) {
    console.error('\n⚠ ВНИМАНИЕ: Дебет ≠ Кредит. Проверьте журнал проводок!')
    process.exit(1)
  }

  console.log('\n✅ Пересчёт завершён успешно.')
}

main()
  .catch((e) => {
    console.error('\n✗ Критическая ошибка:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
