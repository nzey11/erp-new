import 'server-only'
import { db } from '@/lib/shared/db'

// ─── Transaction client type ──────────────────────────────────────────────────
type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

export const PriceService = {
  // ─── Sale Prices ────────────────────────────────────────────────────────────

  async listSalePrices(params: {
    productId?: string
    priceListId?: string
    active?: string
  }) {
    const activeOnly = params.active !== 'false'
    const where: Record<string, unknown> = {}
    if (params.productId) where.productId = params.productId
    if (params.priceListId) where.priceListId = params.priceListId
    if (activeOnly) where.isActive = true

    return db.salePrice.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true } },
        priceList: { select: { id: true, name: true } },
      },
      orderBy: { validFrom: 'desc' },
    })
  },

  async createSalePrice(
    data: {
      productId: string
      priceListId?: string | null
      price: number
      currency: string
      validFrom?: string
      validTo?: string
    },
    tx: TxClient
  ) {
    return tx.salePrice.create({
      data: {
        productId: data.productId,
        priceListId: data.priceListId || null,
        price: data.price,
        currency: data.currency,
        validFrom: data.validFrom ? new Date(data.validFrom) : new Date(),
        validTo: data.validTo ? new Date(data.validTo) : null,
      },
      include: {
        product: { select: { id: true, name: true } },
        priceList: { select: { id: true, name: true } },
      },
    })
  },

  // ─── Purchase Prices ────────────────────────────────────────────────────────

  async listPurchasePrices(params: {
    productId?: string
    supplierId?: string
    active?: string
  }) {
    const activeOnly = params.active !== 'false'
    const where: Record<string, unknown> = {}
    if (params.productId) where.productId = params.productId
    if (params.supplierId) where.supplierId = params.supplierId
    if (activeOnly) where.isActive = true

    return db.purchasePrice.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true } },
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { validFrom: 'desc' },
    })
  },

  async createPurchasePrice(data: {
    productId: string
    supplierId?: string | null
    price: number
    currency: string
    validFrom?: string
    validTo?: string
  }) {
    return db.purchasePrice.create({
      data: {
        productId: data.productId,
        supplierId: data.supplierId || null,
        price: data.price,
        currency: data.currency,
        validFrom: data.validFrom ? new Date(data.validFrom) : new Date(),
        validTo: data.validTo ? new Date(data.validTo) : null,
      },
      include: {
        product: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
    })
  },

  // ─── Price Lists ─────────────────────────────────────────────────────────────

  async listPriceLists() {
    return db.priceList.findMany({
      where: { isActive: true },
      include: { _count: { select: { prices: true } } },
      orderBy: { name: 'asc' },
    })
  },

  async createPriceList(data: { name: string; description?: string | null }) {
    return db.priceList.create({
      data: { name: data.name, description: data.description || null },
    })
  },

  async findPriceListById(id: string) {
    return db.priceList.findUnique({
      where: { id },
      include: {
        prices: {
          where: { isActive: true },
          include: { product: { select: { id: true, name: true, sku: true } } },
          orderBy: { product: { name: 'asc' } },
        },
      },
    })
  },

  async updatePriceList(id: string, data: { name?: string; description?: string | null; isActive?: boolean }) {
    return db.priceList.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description || null }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    })
  },

  async softDeletePriceList(id: string) {
    return db.priceList.update({ where: { id }, data: { isActive: false } })
  },

  // ─── Price List Prices ────────────────────────────────────────────────────

  async findPriceListGate(id: string) {
    return db.priceList.findUnique({ where: { id } })
  },

  async findProductGate(productId: string) {
    return db.product.findUnique({ where: { id: productId } })
  },

  async findExistingPriceListPrice(priceListId: string, productId: string) {
    return db.salePrice.findFirst({
      where: { priceListId, productId, isActive: true },
    })
  },

  async listPriceListPrices(priceListId: string, search?: string) {
    return db.salePrice.findMany({
      where: {
        priceListId,
        isActive: true,
        ...(search && {
          product: {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
            ],
          },
        }),
      },
      include: {
        product: {
          select: { id: true, name: true, sku: true, imageUrl: true, unit: { select: { shortName: true } } },
        },
      },
      orderBy: { product: { name: 'asc' } },
    })
  },

  async updatePriceListPrice(
    priceId: string,
    data: { price: number; validFrom?: string; validTo?: string }
  ) {
    return db.salePrice.update({
      where: { id: priceId },
      data: {
        price: data.price,
        validFrom: data.validFrom ? new Date(data.validFrom) : undefined,
        validTo: data.validTo ? new Date(data.validTo) : null,
      },
      include: { product: { select: { id: true, name: true, sku: true, imageUrl: true } } },
    })
  },

  async createPriceListPrice(data: {
    productId: string
    priceListId: string
    price: number
    validFrom?: string
    validTo?: string
  }) {
    return db.salePrice.create({
      data: {
        productId: data.productId,
        priceListId: data.priceListId,
        price: data.price,
        validFrom: data.validFrom ? new Date(data.validFrom) : new Date(),
        validTo: data.validTo ? new Date(data.validTo) : null,
      },
      include: { product: { select: { id: true, name: true, sku: true, imageUrl: true } } },
    })
  },

  async softDeletePriceListPrice(priceId: string, priceListId: string) {
    return db.salePrice.update({
      where: { id: priceId, priceListId },
      data: { isActive: false },
    })
  },

  // Expose db.$transaction for routes that need outbox atomicity
  get $transaction() {
    return db.$transaction.bind(db)
  },
}
