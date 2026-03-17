import 'server-only'
import { db, toNumber } from '@/lib/shared/db'
import type { DocumentType, PaymentType } from '@/lib/generated/prisma/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ListDocumentsParams {
  type?: string
  types?: string
  status?: string
  warehouseId?: string
  counterpartyId?: string
  dateFrom?: string
  dateTo?: string
  search?: string
  page?: number
  limit?: number
}

export interface CreateDocumentData {
  type: DocumentType
  date?: string
  warehouseId?: string | null
  targetWarehouseId?: string | null
  counterpartyId?: string | null
  paymentType?: PaymentType | null
  description?: string | null
  notes?: string | null
  linkedDocumentId?: string | null
  items?: Array<{
    productId: string
    quantity?: number
    price?: number
    expectedQty?: number | null
    actualQty?: number | null
  }>
}

export interface UpdateDocumentData {
  date?: string
  warehouseId?: string | null
  targetWarehouseId?: string | null
  counterpartyId?: string | null
  paymentType?: PaymentType | null
  description?: string | null
  notes?: string | null
  items?: Array<{
    productId: string
    quantity?: number
    price?: number
    expectedQty?: number | null
    actualQty?: number | null
  }>
}

export interface ExportDocumentsParams {
  group?: string
  type?: string
  dateFrom?: string
  dateTo?: string
}

// ─── Service ──────────────────────────────────────────────────────────────────

const GROUP_TYPES: Record<string, string[]> = {
  purchases: ['purchase_order', 'incoming_shipment', 'supplier_return'],
  sales: ['outgoing_shipment', 'customer_return', 'sales_order'],
  stock: ['inventory_count', 'write_off', 'stock_receipt', 'stock_transfer'],
}

export const DocumentService = {
  async listDocuments(params: ListDocumentsParams, tenantId: string) {
    const {
      type,
      types,
      status,
      warehouseId,
      counterpartyId,
      dateFrom,
      dateTo,
      search,
      page = 1,
      limit = 50,
    } = params

    const where: Record<string, unknown> = { tenantId }
    if (types) {
      where.type = { in: types.split(',') }
    } else if (type) {
      where.type = type
    }
    if (status) where.status = status
    if (warehouseId) where.warehouseId = warehouseId
    if (counterpartyId) where.counterpartyId = counterpartyId
    if (search) where.number = { contains: search }
    if (dateFrom || dateTo) {
      where.date = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo) }),
      }
    }

    const [documents, total] = await Promise.all([
      db.document.findMany({
        where,
        include: {
          warehouse: { select: { id: true, name: true } },
          targetWarehouse: { select: { id: true, name: true } },
          counterparty: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true, phone: true, telegramUsername: true } },
          _count: { select: { items: true } },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.document.count({ where }),
    ])

    return { documents, total, page, limit }
  },

  async createDocument(data: CreateDocumentData, tenantId: string, userId: string, number: string) {
    const {
      type,
      date,
      warehouseId,
      targetWarehouseId,
      counterpartyId,
      paymentType,
      description,
      notes,
      items,
      linkedDocumentId,
    } = data

    // Validate tenant consistency with warehouse
    if (warehouseId) {
      const warehouse = await db.warehouse.findUnique({
        where: { id: warehouseId },
        select: { tenantId: true },
      })
      if (!warehouse) {
        return { error: 'Склад не найден', status: 404 } as const
      }
      if (warehouse.tenantId !== tenantId) {
        return { error: 'Склад принадлежит другому тенанту', status: 400 } as const
      }
    }

    // Validate tenant consistency with target warehouse (for stock_transfer)
    if (targetWarehouseId) {
      const targetWarehouse = await db.warehouse.findUnique({
        where: { id: targetWarehouseId },
        select: { tenantId: true },
      })
      if (!targetWarehouse) {
        return { error: 'Целевой склад не найден', status: 404 } as const
      }
      if (targetWarehouse.tenantId !== tenantId) {
        return { error: 'Целевой склад принадлежит другому тенанту', status: 400 } as const
      }
    }

    // Calculate total from items
    let totalAmount = 0
    const itemsData = (items || []).map((item) => {
      const total = (item.quantity || 0) * (item.price || 0)
      totalAmount += total
      return {
        productId: item.productId,
        quantity: item.quantity || 0,
        price: item.price || 0,
        total,
        expectedQty: item.expectedQty ?? null,
        actualQty: item.actualQty ?? null,
        difference:
          item.expectedQty != null && item.actualQty != null
            ? item.actualQty - item.expectedQty
            : null,
      }
    })

    const document = await db.document.create({
      data: {
        tenantId, // From session, not from client
        number,
        type,
        date: date ? new Date(date) : new Date(),
        warehouseId: warehouseId || null,
        targetWarehouseId: targetWarehouseId || null,
        counterpartyId: counterpartyId || null,
        linkedDocumentId: linkedDocumentId || null,
        totalAmount,
        paymentType: paymentType ?? null,
        description: description || null,
        notes: notes || null,
        createdBy: userId,
        items: { create: itemsData },
      },
      include: {
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        warehouse: { select: { id: true, name: true } },
        targetWarehouse: { select: { id: true, name: true } },
        counterparty: { select: { id: true, name: true } },
      },
    })

    return {
      document: {
        ...document,
        totalAmount: toNumber(document.totalAmount),
        items: document.items.map((item) => ({
          ...item,
          price: toNumber(item.price),
          total: toNumber(item.total),
        })),
      },
    }
  },

  async getDocument(id: string, tenantId: string) {
    return db.document.findFirst({
      where: { id, tenantId },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, sku: true, unit: { select: { shortName: true } } },
            },
          },
        },
        warehouse: { select: { id: true, name: true } },
        targetWarehouse: { select: { id: true, name: true } },
        counterparty: { select: { id: true, name: true } },
        linkedDocument: { select: { id: true, number: true, type: true } },
        linkedFrom: { select: { id: true, number: true, type: true } },
      },
    })
  },

  async updateDocument(id: string, tenantId: string, data: UpdateDocumentData) {
    // Only draft documents can be edited; findFirst enforces tenant ownership
    const existing = await db.document.findFirst({ where: { id, tenantId } })
    if (!existing) {
      return { error: 'Документ не найден', status: 404 } as const
    }
    if (existing.status !== 'draft') {
      return { error: 'Редактирование возможно только для черновиков', status: 400 } as const
    }

    const { date, warehouseId, targetWarehouseId, counterpartyId, paymentType, description, notes, items } = data

    let totalAmount = toNumber(existing.totalAmount)

    // If items are provided, replace all items
    if (items !== undefined) {
      await db.documentItem.deleteMany({ where: { documentId: id } })

      totalAmount = 0
      const itemsData = (items || []).map((item) => {
        const total = (item.quantity || 0) * (item.price || 0)
        totalAmount += total
        return {
          documentId: id,
          productId: item.productId,
          quantity: item.quantity || 0,
          price: item.price || 0,
          total,
          expectedQty: item.expectedQty ?? null,
          actualQty: item.actualQty ?? null,
          difference:
            item.expectedQty != null && item.actualQty != null
              ? item.actualQty - item.expectedQty
              : null,
        }
      })

      if (itemsData.length > 0) {
        await db.documentItem.createMany({ data: itemsData })
      }
    }

    const updateData: Record<string, unknown> = { totalAmount }
    if (date !== undefined) updateData.date = new Date(date)
    if (warehouseId !== undefined) updateData.warehouseId = warehouseId || null
    if (targetWarehouseId !== undefined) updateData.targetWarehouseId = targetWarehouseId || null
    if (counterpartyId !== undefined) updateData.counterpartyId = counterpartyId || null
    if (paymentType !== undefined) updateData.paymentType = paymentType || null
    if (description !== undefined) updateData.description = description || null
    if (notes !== undefined) updateData.notes = notes || null

    const document = await db.document.update({
      where: { id },
      data: updateData,
      include: {
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        warehouse: { select: { id: true, name: true } },
        targetWarehouse: { select: { id: true, name: true } },
        counterparty: { select: { id: true, name: true } },
      },
    })

    return {
      document: {
        ...document,
        totalAmount: toNumber(document.totalAmount),
        items: document.items.map((item) => ({
          ...item,
          price: toNumber(item.price),
          total: toNumber(item.total),
        })),
      },
    }
  },

  async deleteDocument(id: string, tenantId: string) {
    const doc = await db.document.findFirst({ where: { id, tenantId } })
    if (!doc) {
      return { error: 'Документ не найден', status: 404 } as const
    }
    if (doc.status !== 'draft') {
      return { error: 'Удаление возможно только для черновиков', status: 400 } as const
    }

    await db.document.delete({ where: { id } })
    return { success: true }
  },

  async getTenantGate(id: string, tenantId: string) {
    return db.document.findUnique({ where: { id, tenantId }, select: { id: true } })
  },

  async fillInventory(id: string) {
    const doc = await db.document.findUnique({
      where: { id },
      include: { items: true },
    })

    if (!doc) {
      return { error: 'Документ не найден', status: 404 } as const
    }
    if (doc.type !== 'inventory_count') {
      return { error: 'Заполнение доступно только для инвентаризации', status: 400 } as const
    }
    if (doc.status !== 'draft') {
      return { error: 'Заполнение доступно только для черновиков', status: 400 } as const
    }
    if (!doc.warehouseId) {
      return { error: 'Укажите склад в документе', status: 400 } as const
    }

    // Get all stock records for this warehouse
    const stockRecords = await db.stockRecord.findMany({
      where: {
        warehouseId: doc.warehouseId,
        quantity: { not: 0 },
      },
      include: {
        product: { select: { id: true, name: true, sku: true, isActive: true } },
      },
    })

    // Remove existing items and replace with stock data
    await db.documentItem.deleteMany({ where: { documentId: id } })

    const itemsData = stockRecords
      .filter((sr) => sr.product.isActive)
      .map((sr) => ({
        documentId: id,
        productId: sr.productId,
        quantity: 0,
        price: sr.averageCost,
        total: 0,
        expectedQty: sr.quantity,
        actualQty: sr.quantity, // Default actual = expected; user changes it
        difference: 0,
      }))

    if (itemsData.length > 0) {
      await db.documentItem.createMany({ data: itemsData })
    }

    // Reload document with new items
    const updated = await db.document.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, sku: true, unit: { select: { shortName: true } } },
            },
          },
        },
        warehouse: { select: { id: true, name: true } },
      },
    })

    return { document: updated }
  },

  async getDocumentTransitions(id: string) {
    return db.document.findUnique({
      where: { id },
      select: { id: true, type: true, status: true },
    })
  },

  async exportDocuments(params: ExportDocumentsParams) {
    const { group = '', type = '', dateFrom = '', dateTo = '' } = params

    const where: Record<string, unknown> = {}

    if (type) {
      where.type = type
    } else if (group && GROUP_TYPES[group]) {
      where.type = { in: GROUP_TYPES[group] }
    }

    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {}
      if (dateFrom) dateFilter.gte = new Date(dateFrom)
      if (dateTo) {
        const to = new Date(dateTo)
        to.setHours(23, 59, 59, 999)
        dateFilter.lte = to
      }
      where.date = dateFilter
    }

    return db.document.findMany({
      where,
      include: {
        counterparty: { select: { name: true } },
        warehouse: { select: { name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { date: 'desc' },
    })
  },
}
