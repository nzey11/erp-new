import 'server-only'
import { db, toNumber } from '@/lib/shared/db'

export const ReportService = {
  async getProfitabilityData(from: Date, to: Date) {
    const salesDocs = await db.document.findMany({
      where: { type: 'outgoing_shipment', status: 'confirmed', date: { gte: from, lte: to } },
      include: {
        items: {
          include: { product: { select: { id: true, name: true, sku: true } } },
        },
      },
    })

    const productIds = [...new Set(salesDocs.flatMap((d) => d.items.map((i) => i.productId)))]

    const [stockRecords, purchasePrices] = await Promise.all([
      productIds.length > 0
        ? db.stockRecord.findMany({ where: { productId: { in: productIds } }, select: { productId: true, averageCost: true } })
        : [],
      productIds.length > 0
        ? db.purchasePrice.findMany({ where: { productId: { in: productIds }, isActive: true }, orderBy: { validFrom: 'desc' }, select: { productId: true, price: true } })
        : [],
    ])

    return { salesDocs, stockRecords, purchasePrices }
  },

  async getPurchasesAnalyticsData(from: Date, to: Date) {
    return db.document.findMany({
      where: { type: 'incoming_shipment', status: 'confirmed', date: { gte: from, lte: to } },
      include: {
        counterparty: { select: { id: true, name: true } },
        items: true,
      },
      orderBy: { date: 'asc' },
    })
  },

  async getDashboardTrends(currentFrom: Date, currentTo: Date, prevFrom: Date, prevTo: Date) {
    return Promise.all([
      db.document.aggregate({ where: { type: 'outgoing_shipment', status: 'confirmed', date: { gte: currentFrom, lte: currentTo } }, _sum: { totalAmount: true }, _count: { id: true } }),
      db.document.aggregate({ where: { type: 'outgoing_shipment', status: 'confirmed', date: { gte: prevFrom, lte: prevTo } }, _sum: { totalAmount: true }, _count: { id: true } }),
      db.document.aggregate({ where: { type: 'incoming_shipment', status: 'confirmed', date: { gte: currentFrom, lte: currentTo } }, _sum: { totalAmount: true }, _count: { id: true } }),
      db.document.aggregate({ where: { type: 'incoming_shipment', status: 'confirmed', date: { gte: prevFrom, lte: prevTo } }, _sum: { totalAmount: true }, _count: { id: true } }),
    ])
  },

  async getAccountBalances() {
    return db.ledgerLine.groupBy({ by: ['accountId'], _sum: { debit: true, credit: true } })
  },
}

export { toNumber }
