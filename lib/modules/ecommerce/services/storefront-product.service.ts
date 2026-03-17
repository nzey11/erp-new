import 'server-only'
import { db, toNumber } from '@/lib/shared/db'

export const StorefrontProductService = {
  async listPublished(params: {
    where: Record<string, unknown>
    orderBy: Record<string, unknown>
    page: number
    limit: number
  }) {
    const { where, orderBy, page, limit } = params
    return Promise.all([
      db.product.findMany({
        where,
        include: {
          unit: { select: { id: true, shortName: true } },
          category: { select: { id: true, name: true } },
          salePrices: {
            where: { isActive: true, priceListId: null },
            orderBy: { validFrom: 'desc' },
            take: 1,
          },
          discounts: {
            where: {
              isActive: true,
              validFrom: { lte: new Date() },
              OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
            },
            take: 1,
          },
          reviews: { where: { isPublished: true }, select: { rating: true } },
          variants: {
            where: { isActive: true },
            include: { option: { include: { variantType: true } } },
          },
          childVariants: {
            where: { isActive: true, publishedToStore: true },
            select: {
              id: true,
              name: true,
              salePrices: {
                where: { isActive: true, priceListId: null },
                orderBy: { validFrom: 'desc' },
                take: 1,
              },
            },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.product.count({ where }),
    ])
  },

  async findBySlug(slug: string) {
    return db.product.findFirst({
      where: { slug, isActive: true, publishedToStore: true },
      include: {
        unit: { select: { id: true, name: true, shortName: true } },
        category: { select: { id: true, name: true } },
        salePrices: {
          where: { isActive: true, priceListId: null },
          orderBy: { validFrom: 'desc' },
          take: 1,
        },
        purchasePrices: {
          where: { isActive: true },
          orderBy: { validFrom: 'desc' },
          take: 1,
          select: { price: true },
        },
        discounts: {
          where: {
            isActive: true,
            validFrom: { lte: new Date() },
            OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
          },
        },
        customFields: { include: { definition: true } },
        variants: {
          where: { isActive: true },
          include: { option: { include: { variantType: true } } },
          orderBy: { createdAt: 'asc' },
        },
        variantLinksFrom: {
          where: { isActive: true },
          include: {
            linkedProduct: {
              select: {
                id: true,
                name: true,
                slug: true,
                imageUrl: true,
                publishedToStore: true,
                isActive: true,
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        reviews: {
          where: { isPublished: true },
          include: { customer: { select: { name: true, telegramUsername: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        stockRecords: { select: { quantity: true } },
        masterProduct: { select: { id: true, name: true, slug: true, imageUrl: true } },
        childVariants: {
          where: { isActive: true, publishedToStore: true },
          select: {
            id: true,
            name: true,
            slug: true,
            imageUrl: true,
            salePrices: {
              where: { isActive: true, priceListId: null },
              orderBy: { validFrom: 'desc' },
              take: 1,
            },
            stockRecords: { select: { quantity: true } },
          },
        },
      },
    })
  },

  async findRelatedBySlug(slug: string) {
    const product = await db.product.findFirst({
      where: { OR: [{ slug }, { id: slug }], isActive: true, publishedToStore: true },
      select: { id: true, categoryId: true },
    })
    return product
  },

  async listRelated(where: Record<string, unknown>) {
    return db.product.findMany({
      where,
      take: 6,
      orderBy: { createdAt: 'desc' },
      include: {
        salePrices: {
          where: {
            isActive: true,
            priceListId: null,
            validFrom: { lte: new Date() },
            OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
          },
          take: 1,
          orderBy: { validFrom: 'desc' },
        },
        discounts: {
          where: {
            isActive: true,
            validFrom: { lte: new Date() },
            OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
          },
          take: 1,
        },
        reviews: { where: { isPublished: true }, select: { rating: true } },
        unit: { select: { shortName: true } },
      },
    })
  },

  async listProjection(params: {
    where: Record<string, unknown>
    orderBy: Record<string, unknown>
    page: number
    limit: number
  }) {
    const { where, orderBy, page, limit } = params
    return Promise.all([
      db.productCatalogProjection.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.productCatalogProjection.count({ where }),
    ])
  },

  async listVariantsByProductIds(productIds: string[]) {
    return db.productVariant.findMany({
      where: { productId: { in: productIds }, isActive: true },
      include: {
        option: {
          include: { variantType: { select: { id: true, name: true } } },
        },
      },
    })
  },

  async listOriginalForCompare(params: {
    where: Record<string, unknown>
    orderBy: Record<string, unknown>
    page: number
    limit: number
  }) {
    const { where, orderBy, page, limit } = params
    return db.product.findMany({
      where: { ...where, masterProductId: null },
      include: {
        unit: { select: { id: true, shortName: true } },
        category: { select: { id: true, name: true } },
        salePrices: {
          where: { isActive: true, priceListId: null },
          orderBy: { validFrom: 'desc' },
          take: 1,
        },
        discounts: {
          where: {
            isActive: true,
            validFrom: { lte: new Date() },
            OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
          },
          take: 1,
        },
        reviews: { where: { isPublished: true }, select: { rating: true } },
        variants: {
          where: { isActive: true },
          include: { option: { include: { variantType: { select: { name: true } } } } },
        },
        childVariants: {
          where: { isActive: true, publishedToStore: true },
          select: {
            id: true,
            salePrices: {
              where: { isActive: true, priceListId: null },
              orderBy: { validFrom: 'desc' },
              take: 1,
              select: { price: true },
            },
          },
        },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    })
  },
}

export { toNumber }
