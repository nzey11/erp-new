import 'server-only'
import { db, toNumber } from '@/lib/shared/db'
import { reverseEntry, recalculateBalance } from '@/lib/modules/accounting'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ListPaymentsParams {
  type?: string | null
  categoryId?: string | null
  counterpartyId?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  page?: number
  limit?: number
}

export interface CreatePaymentData {
  type: 'income' | 'expense'
  categoryId: string
  counterpartyId?: string | null
  documentId?: string | null
  amount: number
  paymentMethod: 'cash' | 'bank_transfer' | 'card'
  date?: string
  description?: string | null
}

export interface UpdatePaymentData {
  categoryId?: string
  counterpartyId?: string | null
  amount?: number
  paymentMethod?: 'cash' | 'bank_transfer' | 'card'
  date?: string
  description?: string | null
}

export interface CreateFinanceCategoryData {
  name: string
  type: 'income' | 'expense'
  defaultAccountCode?: string | null
}

export interface UpdateFinanceCategoryData {
  name?: string
  defaultAccountCode?: string | null
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const PaymentService = {
  async listPayments(params: ListPaymentsParams, tenantId: string) {
    const {
      type,
      categoryId,
      counterpartyId,
      dateFrom,
      dateTo,
      page = 1,
      limit = 50,
    } = params

    const where: Record<string, unknown> = { tenantId }
    if (type) where.type = type
    if (categoryId) where.categoryId = categoryId
    if (counterpartyId) where.counterpartyId = counterpartyId
    if (dateFrom || dateTo) {
      where.date = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo + 'T23:59:59') } : {}),
      }
    }

    const [payments, total, incomeAgg, expenseAgg] = await Promise.all([
      db.payment.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, type: true } },
          counterparty: { select: { id: true, name: true } },
          document: { select: { id: true, number: true, type: true } },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.payment.count({ where }),
      db.payment.aggregate({ _sum: { amount: true }, where: { ...where, type: 'income' } }),
      db.payment.aggregate({ _sum: { amount: true }, where: { ...where, type: 'expense' } }),
    ])

    const incomeTotal = toNumber(incomeAgg._sum.amount)
    const expenseTotal = toNumber(expenseAgg._sum.amount)

    return { payments, total, page, limit, incomeTotal, expenseTotal, netCashFlow: incomeTotal - expenseTotal }
  },

  async createPayment(data: CreatePaymentData, tenantId: string) {
    const counter = await db.paymentCounter.update({
      where: { prefix: 'PAY' },
      data: { lastNumber: { increment: 1 } },
    })
    const number = `${counter.prefix}-${String(counter.lastNumber).padStart(6, '0')}`

    return db.payment.create({
      data: {
        number,
        type: data.type,
        categoryId: data.categoryId,
        counterpartyId: data.counterpartyId ?? null,
        documentId: data.documentId ?? null,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        date: data.date ? new Date(data.date) : new Date(),
        description: data.description ?? null,
        tenantId,
      },
      include: {
        category: { select: { id: true, name: true, type: true } },
        counterparty: { select: { id: true, name: true } },
        document: { select: { id: true, number: true, type: true } },
      },
    })
  },

  async getPayment(id: string, tenantId: string) {
    return db.payment.findFirst({ where: { id, tenantId } })
  },

  async updatePayment(id: string, tenantId: string, data: UpdatePaymentData) {
    const existing = await db.payment.findFirst({ where: { id, tenantId } })
    if (!existing) return null

    const updated = await db.payment.update({
      where: { id },
      data: {
        ...data,
        ...(data.date ? { date: new Date(data.date) } : {}),
      },
      include: {
        category: { select: { id: true, name: true, type: true } },
        counterparty: { select: { id: true, name: true } },
        document: { select: { id: true, number: true, type: true } },
      },
    })

    // Reverse the old journal entry and re-post with updated data
    try {
      const oldEntry = await db.journalEntry.findFirst({
        where: { sourceId: id, sourceType: 'finance_payment', isReversed: false },
      })
      if (oldEntry) {
        await reverseEntry(oldEntry.id, { bypassAutoCheck: true })
      }
      // Re-post: build new journal entry directly (bypass idempotency check)
      const cashAccountCode = updated.paymentMethod === 'cash' ? '50' : '51'
      const catData = updated.category as unknown as { defaultAccountCode?: string | null }
      const categoryAccountCode =
        catData.defaultAccountCode ?? (updated.type === 'income' ? '91.1' : '91.2')
      const [cashAccount, categoryAccount] = await Promise.all([
        db.account.findUnique({ where: { code: cashAccountCode } }),
        db.account.findUnique({ where: { code: categoryAccountCode } }),
      ])
      if (cashAccount && categoryAccount) {
        const counter = await db.journalCounter.upsert({
          where: { prefix: 'JE' },
          update: { lastNumber: { increment: 1 } },
          create: { prefix: 'JE', lastNumber: 1 },
        })
        const jeNumber = `JE-${String(counter.lastNumber).padStart(6, '0')}`
        const debitAccountId = updated.type === 'income' ? cashAccount.id : categoryAccount.id
        const creditAccountId = updated.type === 'income' ? categoryAccount.id : cashAccount.id
        const description = updated.description
          ? `${updated.category.name}: ${updated.description}`
          : updated.category.name
        await db.journalEntry.create({
          data: {
            number: jeNumber,
            date: updated.date,
            description,
            sourceType: 'finance_payment',
            sourceId: id,
            sourceNumber: updated.number,
            isManual: false,
            createdBy: null,
            lines: {
              create: [
                {
                  accountId: debitAccountId,
                  debit: updated.amount,
                  credit: 0,
                  counterpartyId: updated.counterpartyId ?? null,
                  currency: 'RUB',
                  amountRub: updated.amount,
                },
                {
                  accountId: creditAccountId,
                  debit: 0,
                  credit: updated.amount,
                  counterpartyId: updated.counterpartyId ?? null,
                  currency: 'RUB',
                  amountRub: updated.amount,
                },
              ],
            },
          },
        })
      }
    } catch {
      /* journal update is non-critical */
    }

    return updated
  },

  async deletePayment(id: string, tenantId: string) {
    const existing = await db.payment.findFirst({ where: { id, tenantId } })
    if (!existing) return null

    // Reverse journal entry before deleting the payment
    try {
      const entry = await db.journalEntry.findFirst({
        where: { sourceId: id, sourceType: 'finance_payment', isReversed: false },
      })
      if (entry) await reverseEntry(entry.id, { bypassAutoCheck: true })
    } catch {
      /* non-critical */
    }

    await db.payment.delete({ where: { id } })

    // Recalculate counterparty balance so mutual settlements stay accurate
    if (existing.counterpartyId) {
      try {
        await recalculateBalance(existing.counterpartyId)
      } catch {
        /* non-critical */
      }
    }

    return { success: true, counterpartyId: existing.counterpartyId }
  },

  async listFinanceCategories(typeFilter?: string | null) {
    return db.financeCategory.findMany({
      where: {
        isActive: true,
        ...(typeFilter ? { type: typeFilter } : {}),
      },
      orderBy: [{ type: 'asc' }, { order: 'asc' }, { name: 'asc' }],
    })
  },

  async createFinanceCategory(data: CreateFinanceCategoryData) {
    const maxOrder = await db.financeCategory.aggregate({
      where: { type: data.type },
      _max: { order: true },
    })

    return db.financeCategory.create({
      data: {
        ...data,
        isSystem: false,
        order: (maxOrder._max.order ?? 0) + 1,
      },
    })
  },

  async updateFinanceCategory(id: string, data: UpdateFinanceCategoryData) {
    const existing = await db.financeCategory.findUnique({ where: { id } })
    if (!existing) return { error: 'Not found', status: 404 } as const
    // System categories: only defaultAccountCode can be updated, not name
    if (existing.isSystem && data.name) {
      return { error: 'Cannot rename system category', status: 403 } as const
    }

    const updated = await db.financeCategory.update({
      where: { id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.defaultAccountCode !== undefined
          ? { defaultAccountCode: data.defaultAccountCode }
          : {}),
      },
    })
    return { category: updated }
  },

  async deleteFinanceCategory(id: string) {
    const existing = await db.financeCategory.findUnique({ where: { id } })
    if (!existing) return { error: 'Not found', status: 404 } as const
    if (existing.isSystem) {
      return { error: 'Cannot delete system category', status: 403 } as const
    }

    // Check if used by payments
    const usedCount = await db.payment.count({ where: { categoryId: id } })
    if (usedCount > 0) {
      return { error: 'Category is used by payments', status: 409 } as const
    }

    await db.financeCategory.delete({ where: { id } })
    return { success: true }
  },

  /** Cash flow summary (income vs expense) for a given period */
  async getCashFlow(tenantId: string, from: Date, to: Date) {
    const [incomeAgg, expenseAgg] = await Promise.all([
      db.payment.aggregate({
        _sum: { amount: true },
        where: { tenantId, type: 'income', date: { gte: from, lte: to } },
      }),
      db.payment.aggregate({
        _sum: { amount: true },
        where: { tenantId, type: 'expense', date: { gte: from, lte: to } },
      }),
    ])
    const cashIn = toNumber(incomeAgg._sum.amount)
    const cashOut = toNumber(expenseAgg._sum.amount)
    return { cashIn, cashOut, netCashFlow: cashIn - cashOut }
  },
}
