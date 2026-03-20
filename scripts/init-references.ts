import 'dotenv/config'
import { db } from '../lib/shared/db'

/**
 * Initialize reference data after database cleanup.
 * - Units of measurement (Unit model — no tenantId, global)
 * - Finance categories (FinanceCategory model — no tenantId, no unique on name)
 */
async function initReferences() {
  console.log('🚀 Initializing reference data...\n')

  // ----------------------------------------------------------------
  // FIX 2: Units of measurement
  // Note: Unit model has NO tenantId — it is global/shared.
  // ----------------------------------------------------------------
  const units = [
    { name: 'Штука',    shortName: 'шт' },
    { name: 'Килограмм', shortName: 'кг' },
    { name: 'Грамм',    shortName: 'г' },
    { name: 'Литр',     shortName: 'л' },
    { name: 'Метр',     shortName: 'м' },
    { name: 'Упаковка', shortName: 'уп' },
    { name: 'Коробка',  shortName: 'кор' },
    { name: 'Пара',     shortName: 'пар' },
  ]

  let unitsCreated = 0
  let unitsSkipped = 0

  for (const unit of units) {
    const result = await db.unit.upsert({
      where: { shortName: unit.shortName },
      update: {},
      create: { name: unit.name, shortName: unit.shortName },
    })
    if (result.createdAt.getTime() === result.updatedAt.getTime()) {
      unitsCreated++
    } else {
      unitsSkipped++
    }
  }

  console.log(`✓ Units: ${unitsCreated} created, ${unitsSkipped} already existed`)

  // ----------------------------------------------------------------
  // FIX 3: Finance categories
  // FinanceCategory has @@unique([name, type]) in schema, and a unique index in DB.
  // Prisma generated types may not expose name_type compound key until next full migrate.
  // We use deterministic id-based upsert (same pattern as prisma/seed.ts).
  // ----------------------------------------------------------------
  const incomeCategories = [
    'Оплата от покупателя',
    'Прочие доходы',
    'Возврат от поставщика',
  ]

  const expenseCategories = [
    'Оплата поставщику',
    'Прочие расходы',
    'Возврат покупателю',
    'Зарплата',
    'Аренда',
    'Транспортные расходы',
  ]

  let categoriesCreated = 0
  // categoriesSkipped reserved for future use
  // let categoriesSkipped = 0

  const allCategories: Array<{ name: string; type: string; id: string }> = [
    ...incomeCategories.map((name, i) => ({ name, type: 'income', id: `ref-income-${i}` })),
    ...expenseCategories.map((name, i) => ({ name, type: 'expense', id: `ref-expense-${i}` })),
  ]

  for (const cat of allCategories) {
    await db.financeCategory.upsert({
      where: { id: cat.id },
      update: {},
      create: { id: cat.id, name: cat.name, type: cat.type },
    })
    categoriesCreated++
  }

  console.log(`✓ Finance categories: ${categoriesCreated} upserted`)

  // ----------------------------------------------------------------
  // Verification
  // ----------------------------------------------------------------
  const [unitCount, incomeCatCount, expenseCatCount] = await Promise.all([
    db.unit.count(),
    db.financeCategory.count({ where: { type: 'income' } }),
    db.financeCategory.count({ where: { type: 'expense' } }),
  ])

  console.log('\n📊 Verification:')
  console.log(`Units            : ${unitCount}`)
  console.log(`Income categories: ${incomeCatCount}`)
  console.log(`Expense categories: ${expenseCatCount}`)

  await db.$disconnect()
  console.log('\n✅ Done! Reference data initialized.')
}

initReferences().catch(console.error)
