import 'server-only'
import { db } from '@/lib/shared/db'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GetStockParams {
  warehouseId?: string
  productId?: string
  search?: string
  nonZero?: string
  enhanced?: string
}

export interface ExportStockParams {
  warehouseId?: string
  search?: string
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const StockService = {
  async getStock(params: GetStockParams, tenantId: string) {
    const warehouseId = params.warehouseId
    const productId = params.productId
    const search = params.search || ''
    const nonZero = params.nonZero !== 'false'
    const enhanced = params.enhanced === 'true'

    const where: Record<string, unknown> = {
      warehouse: { tenantId }, // Tenant scoping
    }
    if (warehouseId) where.warehouseId = warehouseId
    if (productId) where.productId = productId
    if (nonZero) where.quantity = { not: 0 }
    if (search) {
      where.product = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
        ],
      }
    }

    const records = await db.stockRecord.findMany({
      where,
      include: {
        warehouse: { select: { id: true, name: true } },
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            unit: { select: { shortName: true } },
            category: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { product: { name: 'asc' } },
    })

    if (!enhanced) {
      return { records, enhanced: false as const }
    }

    // Enhanced mode: calculate reserve, available, cost, sale values
    const productIds = [...new Set(records.map((r) => r.productId))]

    // Reserve: quantities in draft outgoing documents
    const draftOutgoingItems =
      productIds.length > 0
        ? await db.documentItem.findMany({
            where: {
              productId: { in: productIds },
              document: {
                status: 'draft',
                type: { in: ['outgoing_shipment', 'supplier_return', 'sales_order'] },
              },
            },
            select: {
              productId: true,
              quantity: true,
              document: { select: { warehouseId: true } },
            },
          })
        : []

    // Build reserve map: key = productId:warehouseId
    const reserveMap: Record<string, number> = {}
    for (const item of draftOutgoingItems) {
      const key = `${item.productId}:${item.document.warehouseId || ''}`
      reserveMap[key] = (reserveMap[key] || 0) + item.quantity
    }

    // Latest purchase prices per product
    const purchasePrices =
      productIds.length > 0
        ? await db.purchasePrice.findMany({
            where: { productId: { in: productIds }, isActive: true },
            orderBy: { validFrom: 'desc' },
            select: { productId: true, price: true },
          })
        : []

    const purchasePriceMap: Record<string, number> = {}
    for (const pp of purchasePrices) {
      if (!(pp.productId in purchasePriceMap)) {
        purchasePriceMap[pp.productId] = Number(pp.price)
      }
    }

    // Latest sale prices per product (default price list = no priceListId)
    const salePrices =
      productIds.length > 0
        ? await db.salePrice.findMany({
            where: { productId: { in: productIds }, isActive: true, priceListId: null },
            orderBy: { validFrom: 'desc' },
            select: { productId: true, price: true },
          })
        : []

    const salePriceMap: Record<string, number> = {}
    for (const sp of salePrices) {
      if (!(sp.productId in salePriceMap)) {
        salePriceMap[sp.productId] = Number(sp.price)
      }
    }

    return {
      records,
      enhanced: true as const,
      reserveMap,
      purchasePriceMap,
      salePriceMap,
    }
  },

  async exportStockRecords(params: ExportStockParams, tenantId: string) {
    const { warehouseId = '', search = '' } = params

    const where: Record<string, unknown> = {
      quantity: { not: 0 },
      warehouse: { tenantId }, // Tenant scoping
    }
    if (warehouseId) where.warehouseId = warehouseId
    if (search) {
      where.product = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
        ],
      }
    }

    return db.stockRecord.findMany({
      where,
      include: {
        warehouse: { select: { name: true } },
        product: {
          select: {
            name: true,
            sku: true,
            unit: { select: { shortName: true } },
            category: { select: { name: true } },
          },
        },
      },
      orderBy: { product: { name: 'asc' } },
    })
  },
}
