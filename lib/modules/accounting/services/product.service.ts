import 'server-only'
import { db, toNumber } from '@/lib/shared/db'
import type { DiscountType } from '@/lib/generated/prisma/client'

// ─── Transaction client type ──────────────────────────────────────────────────
type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ListProductsParams {
  search?: string
  categoryId?: string
  active?: string
  published?: string
  hasDiscount?: string
  variantStatus?: string
  sortBy?: string
  sortOrder?: string
  page?: number
  limit?: number
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const ProductService = {
  async list(params: ListProductsParams, tenantId: string) {
    const {
      search,
      categoryId,
      active,
      published,
      hasDiscount,
      variantStatus,
      sortBy,
      sortOrder = 'asc',
      page = 1,
      limit = 50,
    } = params

    const where: Record<string, unknown> = { tenantId }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { sku: { contains: search } },
        { barcode: { contains: search } },
      ]
    }
    if (categoryId) where.categoryId = categoryId
    if (active) where.isActive = active === 'true'
    if (published) where.publishedToStore = published === 'true'
    if (hasDiscount === 'true') {
      where.discounts = {
        some: {
          isActive: true,
          OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
        },
      }
    }
    if (variantStatus === 'masters') {
      where.masterProductId = null
      where.childVariants = { some: { isActive: true } }
    } else if (variantStatus === 'variants') {
      where.masterProductId = { not: null }
    } else if (variantStatus === 'unlinked') {
      where.masterProductId = null
      where.childVariants = { none: {} }
    }

    let orderBy: Record<string, string> | Record<string, Record<string, string>> = { name: sortOrder }
    if (sortBy === 'sku') {
      orderBy = { sku: sortOrder }
    } else if (sortBy === 'createdAt') {
      orderBy = { createdAt: sortOrder }
    }

    const [products, total] = await Promise.all([
      db.product.findMany({
        where,
        include: {
          unit: { select: { id: true, shortName: true } },
          category: { select: { id: true, name: true } },
          purchasePrices: {
            where: { isActive: true },
            orderBy: { validFrom: 'desc' },
            take: 1,
            select: { price: true },
          },
          salePrices: {
            where: { isActive: true, priceListId: null },
            orderBy: { validFrom: 'desc' },
            take: 1,
            select: { price: true },
          },
          discounts: {
            where: {
              isActive: true,
              OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          _count: {
            select: {
              variantLinksFrom: { where: { isActive: true } },
              childVariants: { where: { isActive: true } },
            },
          },
          masterProduct: { select: { id: true, name: true } },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.product.count({ where }),
    ])

    return { products, total, page, limit }
  },

  async findById(id: string, tenantId: string) {
    return db.product.findUnique({
      where: { id, tenantId },
      include: {
        unit: true,
        category: true,
        stockRecords: { include: { warehouse: { select: { id: true, name: true } } } },
        purchasePrices: { where: { isActive: true }, orderBy: { validFrom: 'desc' }, take: 1 },
        salePrices: { where: { isActive: true, priceListId: null }, orderBy: { validFrom: 'desc' }, take: 1 },
        customFields: { include: { definition: true } },
        variants: {
          where: { isActive: true },
          include: { option: { include: { variantType: { select: { id: true, name: true } } } } },
        },
        discounts: { where: { isActive: true }, orderBy: { createdAt: 'desc' } },
      },
    })
  },

  async getTenantGate(id: string, tenantId: string) {
    return db.product.findUnique({ where: { id, tenantId }, select: { id: true } })
  },

  async create(
    data: {
      tenantId: string
      name: string
      sku: string | null
      barcode?: string | null
      description?: string | null
      unitId: string
      categoryId?: string | null
      imageUrl?: string | null
      seoTitle?: string | null
      seoDescription?: string | null
      seoKeywords?: string | null
      slug: string | null
      publishedToStore?: boolean
      purchasePrice?: string | number | null
      salePrice?: string | number | null
    },
    tx: TxClient
  ) {
    const { purchasePrice, salePrice, ...rest } = data
    return tx.product.create({
      data: {
        ...rest,
        ...(purchasePrice != null && purchasePrice !== '' && {
          purchasePrices: { create: { price: parseFloat(String(purchasePrice)), isActive: true } },
        }),
        ...(salePrice != null && salePrice !== '' && {
          salePrices: { create: { price: parseFloat(String(salePrice)), isActive: true } },
        }),
      },
      include: {
        unit: { select: { id: true, shortName: true } },
        category: { select: { id: true, name: true } },
        purchasePrices: { where: { isActive: true }, orderBy: { validFrom: 'desc' }, take: 1, select: { price: true } },
        salePrices: { where: { isActive: true, priceListId: null }, orderBy: { validFrom: 'desc' }, take: 1, select: { price: true } },
      },
    })
  },

  async update(
    id: string,
    updateData: Record<string, unknown>,
    tx: TxClient
  ) {
    return tx.product.update({
      where: { id },
      data: updateData,
      include: {
        unit: { select: { id: true, shortName: true } },
        category: { select: { id: true, name: true } },
      },
    })
  },

  async softDelete(id: string, tx: TxClient) {
    return tx.product.update({
      where: { id },
      data: { isActive: false },
    })
  },

  async updatePurchasePrice(id: string, purchasePrice: string | number | null | undefined) {
    await db.purchasePrice.updateMany({ where: { productId: id, isActive: true }, data: { isActive: false } })
    if (purchasePrice != null && purchasePrice !== '') {
      await db.purchasePrice.create({ data: { productId: id, price: parseFloat(String(purchasePrice)), isActive: true } })
    }
  },

  async updateSalePrice(id: string, salePrice: string | number | null | undefined, tx: TxClient) {
    await tx.salePrice.updateMany({ where: { productId: id, isActive: true }, data: { isActive: false } })
    if (salePrice != null && salePrice !== '') {
      await tx.salePrice.create({ data: { productId: id, price: parseFloat(String(salePrice)), isActive: true } })
    }
  },

  async generateSku(prefix: string): Promise<string> {
    const counter = await db.skuCounter.upsert({
      where: { prefix },
      create: { prefix, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    })
    return `${prefix}-${String(counter.lastNumber).padStart(6, '0')}`
  },

  async bulkUpdateMany(productIds: string[], data: Record<string, unknown>, tx: TxClient) {
    return tx.product.updateMany({
      where: { id: { in: productIds } },
      data,
    })
  },

  async bulkHardDelete(productIds: string[], tx: TxClient) {
    await tx.productCustomField.deleteMany({ where: { productId: { in: productIds } } })
    await tx.productVariantLink.deleteMany({
      where: { OR: [{ productId: { in: productIds } }, { linkedProductId: { in: productIds } }] },
    })
    await tx.productDiscount.deleteMany({ where: { productId: { in: productIds } } })
    await tx.productVariant.deleteMany({ where: { productId: { in: productIds } } })
    await tx.purchasePrice.deleteMany({ where: { productId: { in: productIds } } })
    await tx.salePrice.deleteMany({ where: { productId: { in: productIds } } })
    await tx.stockRecord.deleteMany({ where: { productId: { in: productIds } } })
    await tx.product.deleteMany({ where: { id: { in: productIds } } })
  },

  async exportProducts(params: {
    search?: string
    categoryId?: string
    active?: string
    published?: string
    hasDiscount?: string
  }) {
    const { search, categoryId, active, published, hasDiscount } = params

    const where: Record<string, unknown> = {}
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (categoryId) where.categoryId = categoryId
    if (active !== undefined) where.isActive = active === 'true'
    if (published) where.publishedToStore = published === 'true'
    if (hasDiscount === 'true') {
      where.discounts = {
        some: {
          isActive: true,
          OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
        },
      }
    }

    return db.product.findMany({
      where,
      include: {
        unit: { select: { name: true, shortName: true } },
        category: { select: { name: true } },
        salePrices: { where: { isActive: true, priceListId: null }, orderBy: { validFrom: 'desc' }, take: 1 },
        purchasePrices: { where: { isActive: true }, orderBy: { validFrom: 'desc' }, take: 1 },
      },
      orderBy: { name: 'asc' },
    })
  },

  async importLoadUnitsAndCategories() {
    const [units, categories] = await Promise.all([
      db.unit.findMany({ where: { isActive: true } }),
      db.productCategory.findMany({ where: { isActive: true } }),
    ])
    return { units, categories }
  },

  async importFindBySku(sku: string) {
    return db.product.findFirst({ where: { sku } })
  },

  async importUpdateProduct(
    id: string,
    data: {
      name: string
      barcode?: string | null
      description?: string | null
      unitId: string
      categoryId: string | null
    },
    prices: { purchasePrice?: number | null; salePrice?: number | null }
  ) {
    await db.product.update({ where: { id }, data })

    if (prices.purchasePrice != null) {
      await db.purchasePrice.updateMany({ where: { productId: id, isActive: true }, data: { isActive: false } })
      await db.purchasePrice.create({ data: { productId: id, price: prices.purchasePrice, validFrom: new Date() } })
    }
    if (prices.salePrice != null) {
      await db.salePrice.updateMany({ where: { productId: id, isActive: true, priceListId: null }, data: { isActive: false } })
      await db.salePrice.create({ data: { productId: id, price: prices.salePrice, validFrom: new Date() } })
    }
  },

  async importCreateProduct(
    data: {
      tenantId: string
      name: string
      sku?: string | null
      barcode?: string | null
      description?: string | null
      unitId: string
      categoryId: string | null
    },
    prices: { purchasePrice?: number | null; salePrice?: number | null }
  ) {
    const product = await db.product.create({ data })
    if (prices.purchasePrice != null) {
      await db.purchasePrice.create({ data: { productId: product.id, price: prices.purchasePrice, validFrom: new Date() } })
    }
    if (prices.salePrice != null) {
      await db.salePrice.create({ data: { productId: product.id, price: prices.salePrice, validFrom: new Date() } })
    }
    return product
  },

  async getProductForDiscount(productId: string) {
    return db.product.findUnique({
      where: { id: productId },
      include: {
        purchasePrices: { where: { isActive: true }, orderBy: { validFrom: 'desc' }, take: 1 },
        salePrices: { where: { isActive: true }, orderBy: { validFrom: 'desc' }, take: 1 },
      },
    })
  },

  async createDiscount(
    productId: string,
    data: { name: string; type: DiscountType; value: number; validFrom?: string; validTo?: string },
    tx: TxClient
  ) {
    return tx.productDiscount.create({
      data: {
        productId,
        name: data.name,
        type: data.type,
        value: data.value,
        validFrom: data.validFrom ? new Date(data.validFrom) : new Date(),
        validTo: data.validTo ? new Date(data.validTo) : null,
      },
    })
  },

  async deactivateDiscount(discountId: string, tx: TxClient) {
    return tx.productDiscount.update({
      where: { id: discountId },
      data: { isActive: false },
    })
  },

  async listDiscounts(productId: string) {
    return db.productDiscount.findMany({
      where: { productId, isActive: true },
      orderBy: { createdAt: 'desc' },
    })
  },

  async listCustomFields(productId: string) {
    return db.productCustomField.findMany({
      where: { productId },
      include: { definition: true },
      orderBy: { definition: { order: 'asc' } },
    })
  },

  async upsertCustomFields(productId: string, fields: Array<{ definitionId: string; value: unknown }>) {
    // Check product exists
    const product = await db.product.findUnique({ where: { id: productId } })
    if (!product) return null

    const results = await Promise.all(
      fields.map((f) =>
        db.productCustomField.upsert({
          where: { productId_definitionId: { productId, definitionId: f.definitionId } },
          create: { productId, definitionId: f.definitionId, value: String(f.value) },
          update: { value: String(f.value) },
          include: { definition: true },
        })
      )
    )
    return results
  },

  async listVariantLinks(productId: string) {
    return db.productVariantLink.findMany({
      where: { productId, isActive: true },
      include: {
        linkedProduct: {
          select: {
            id: true,
            name: true,
            sku: true,
            imageUrl: true,
            salePrices: { where: { isActive: true }, orderBy: { validFrom: 'desc' }, take: 1, select: { price: true } },
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    })
  },

  async findLinkedProduct(linkedProductId: string) {
    return db.product.findUnique({
      where: { id: linkedProductId },
      select: {
        id: true,
        name: true,
        sku: true,
        imageUrl: true,
        salePrices: { where: { isActive: true }, orderBy: { validFrom: 'desc' }, take: 1, select: { price: true } },
      },
    })
  },

  async findVariantLink(productId: string, linkedProductId: string) {
    return db.productVariantLink.findFirst({ where: { productId, linkedProductId } })
  },

  async reactivateVariantLink(
    linkId: string,
    data: { groupName?: string },
    productId: string,
    linkedProductId: string,
    tx: TxClient
  ) {
    await tx.productVariantLink.update({
      where: { id: linkId },
      data: { isActive: true, ...(data.groupName && { groupName: data.groupName }) },
    })
    await tx.product.update({ where: { id: linkedProductId }, data: { masterProductId: productId } })
  },

  async createVariantLink(
    productId: string,
    linkedProductId: string,
    groupName: string,
    tx: TxClient
  ) {
    const created = await tx.productVariantLink.create({
      data: { productId, linkedProductId, groupName },
    })
    await tx.product.update({ where: { id: linkedProductId }, data: { masterProductId: productId } })
    return created
  },

  async findVariantLinkById(linkId: string) {
    return db.productVariantLink.findUnique({
      where: { id: linkId },
      select: { linkedProductId: true },
    })
  },

  async deactivateVariantLink(linkId: string, linkedProductId: string | undefined, productId: string, tx: TxClient) {
    await tx.productVariantLink.update({ where: { id: linkId }, data: { isActive: false } })
    if (linkedProductId) {
      await tx.product.update({ where: { id: linkedProductId }, data: { masterProductId: null } })
    }
  },

  async listVariants(productId: string) {
    return db.productVariant.findMany({
      where: { productId, isActive: true },
      include: { option: { include: { variantType: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: 'asc' },
    })
  },

  async findProductForVariant(productId: string) {
    return db.product.findUnique({ where: { id: productId } })
  },

  async createVariant(data: {
    productId: string
    optionId: string
    tenantId: string
    sku?: string | null
    barcode?: string | null
    priceAdjustment?: number
  }) {
    return db.productVariant.create({
      data: {
        productId: data.productId,
        optionId: data.optionId,
        tenantId: data.tenantId,
        sku: data.sku || null,
        barcode: data.barcode || null,
        priceAdjustment: data.priceAdjustment ?? 0,
      },
      include: { option: { include: { variantType: { select: { id: true, name: true } } } } },
    })
  },

  async deactivateVariant(variantId: string) {
    return db.productVariant.update({ where: { id: variantId }, data: { isActive: false } })
  },

  async findProductForDuplicate(id: string) {
    return db.product.findUnique({
      where: { id },
      include: {
        customFields: { include: { definition: true } },
        purchasePrices: { where: { isActive: true }, orderBy: { validFrom: 'desc' }, take: 1 },
        salePrices: { where: { isActive: true, priceListId: null }, orderBy: { validFrom: 'desc' }, take: 1 },
      },
    })
  },

  async duplicateProduct(
    source: {
      tenantId: string | null
      name: string
      sku: string | null
      description: string | null
      unitId: string
      categoryId: string | null
      imageUrl: string | null
      isActive: boolean
      seoTitle: string | null
      seoDescription: string | null
      seoKeywords: string | null
      customFields: Array<{ definitionId: string; value: string }>
      purchasePrices: Array<{ price: unknown; currency: string }>
      salePrices: Array<{ price: unknown; currency: string }>
    },
    tenantId: string
  ) {
    return db.product.create({
      data: {
        tenantId: source.tenantId || tenantId,
        name: `${source.name} (копия)`,
        sku: null,
        barcode: null,
        description: source.description,
        unitId: source.unitId,
        categoryId: source.categoryId,
        imageUrl: source.imageUrl,
        isActive: true,
        publishedToStore: false,
        seoTitle: source.seoTitle,
        seoDescription: source.seoDescription,
        seoKeywords: source.seoKeywords,
        slug: null,
        customFields: {
          create: source.customFields.map((cf) => ({
            definitionId: cf.definitionId,
            value: cf.value,
          })),
        },
        ...(source.purchasePrices[0] && {
          purchasePrices: {
            create: { price: Number(source.purchasePrices[0].price), currency: source.purchasePrices[0].currency, isActive: true },
          },
        }),
        ...(source.salePrices[0] && {
          salePrices: {
            create: { price: Number(source.salePrices[0].price), currency: source.salePrices[0].currency, isActive: true },
          },
        }),
      },
      include: {
        unit: { select: { id: true, shortName: true } },
        category: { select: { id: true, name: true } },
        purchasePrices: { where: { isActive: true }, orderBy: { validFrom: 'desc' }, take: 1 },
        salePrices: { where: { isActive: true }, orderBy: { validFrom: 'desc' }, take: 1 },
      },
    })
  },

  // Expose db.$transaction so routes can pass tx client
  get $transaction() {
    return db.$transaction.bind(db)
  },
}

export { toNumber }
