import 'dotenv/config'
import { db } from '../lib/shared/db'

function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return v
  // @ts-ignore
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
  return parseFloat(String(v)) || 0
}

async function diagnose() {
  const tenant = await db.tenant.findFirst()
  if (!tenant) { console.log('No tenant found'); await db.$disconnect(); return }
  const tenantId = tenant.id
  console.log(`\nTenant: ${tenant.name} (${tenantId})`)

  const accounts = await db.account.findMany({ orderBy: { code: 'asc' } })
  console.log('\n=== Chart of Accounts with balances ===')
  for (const acc of accounts) {
    const lines = await db.ledgerLine.aggregate({
      where: { accountId: acc.id },
      _sum: { debit: true, credit: true }
    })
    const debit = toNumber(lines._sum.debit)
    const credit = toNumber(lines._sum.credit)
    if (debit > 0 || credit > 0) {
      console.log(`${acc.code} ${acc.name}: Дт=${debit.toFixed(2)} Кт=${credit.toFixed(2)} Сальдо=${(debit-credit).toFixed(2)}`)
    }
  }

  const journals = await db.journalEntry.findMany({
    include: { lines: { include: { account: true } } },
    orderBy: { createdAt: 'asc' }
  })
  console.log(`\n=== Journal Entries (total: ${journals.length}) ===`)
  let unbalancedCount = 0
  for (const je of journals) {
    const totalDebit = je.lines.reduce((s, l) => s + toNumber(l.debit), 0)
    const totalCredit = je.lines.reduce((s, l) => s + toNumber(l.credit), 0)
    const balanced = Math.abs(totalDebit - totalCredit) < 0.01
    if (!balanced) unbalancedCount++
    console.log(`${je.number} ${je.description}: Дт=${totalDebit.toFixed(2)} Кт=${totalCredit.toFixed(2)} ${balanced ? '✅' : '❌ РАЗБАЛАНС!'}`)
  }
  console.log(`\nUnbalanced entries: ${unbalancedCount}`)

  // Check stock records with zero quantity
  const zeroStockCount = await db.stockRecord.count({ where: { quantity: 0 } })
  const totalStockCount = await db.stockRecord.count()
  console.log(`\n=== Stock Records ===`)
  console.log(`Total: ${totalStockCount}, Zero-quantity: ${zeroStockCount}`)

  // Check counterparties with missing balance records
  const cpCount = await db.counterparty.count({ where: { tenantId } })
  const cbCount = await db.counterpartyBalance.count({
    where: { counterparty: { tenantId } }
  })
  console.log(`\n=== Counterparties ===`)
  console.log(`Counterparties: ${cpCount}, Balance records: ${cbCount}`)
  if (cpCount !== cbCount) {
    console.log(`⚠️  MISMATCH: ${cpCount - cbCount} counterparties missing balance records`)
  }

  await db.$disconnect()
}

diagnose().catch(console.error)
