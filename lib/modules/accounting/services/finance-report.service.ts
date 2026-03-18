import 'server-only'
import { db, toNumber } from '@/lib/shared/db'

export const FinanceReportService = {
  async getCounterpartyBalances(params: { asOfDate?: string } = {}) {
    const where: Record<string, unknown> = { NOT: { balanceRub: 0 } }
    if (params.asOfDate) {
      where.lastUpdatedAt = { lte: new Date(params.asOfDate + 'T23:59:59.999Z') }
    }
    return db.counterpartyBalance.findMany({
      where,
      include: { counterparty: { select: { id: true, name: true, type: true } } },
      orderBy: { balanceRub: 'desc' },
    })
  },

  async getDrillDownDocuments(params: {
    docTypes: string[]
    tenantId: string
    dateFilter: Record<string, unknown>
  }) {
    return db.document.findMany({
      where: {
        type: { in: params.docTypes as never[] },
        status: 'confirmed',
        tenantId: params.tenantId,
        ...params.dateFilter,
      },
      include: {
        counterparty: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true } },
      },
      orderBy: { confirmedAt: 'desc' },
      take: 500,
    })
  },

  async getDrillDownPayments(params: {
    paymentType: string
    tenantId: string
    dateFilter: Record<string, unknown>
    paymentMethod?: string
  }) {
    return db.payment.findMany({
      where: {
        type: params.paymentType,
        tenantId: params.tenantId,
        ...(params.paymentMethod ? { paymentMethod: params.paymentMethod as never } : {}),
        ...params.dateFilter,
      },
      include: {
        counterparty: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        document: { select: { id: true, number: true, type: true } },
      },
      orderBy: { date: 'desc' },
      take: 500,
    })
  },

  async getReceivablesBalances() {
    return db.counterpartyBalance.findMany({
      where: { balanceRub: { gt: 0 } },
      include: { counterparty: { select: { id: true, name: true, type: true } } },
      orderBy: { balanceRub: 'desc' },
    })
  },
}

export { toNumber }
