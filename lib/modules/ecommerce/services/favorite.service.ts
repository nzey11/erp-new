import 'server-only'
import { db, toNumber } from '@/lib/shared/db'

export const FavoriteService = {
  async list(customerId: string) {
    return db.favorite.findMany({
      where: { customerId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            imageUrl: true,
            isActive: true,
            publishedToStore: true,
            unit: { select: { shortName: true } },
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
            reviews: {
              where: { isPublished: true },
              select: { rating: true },
            },
          },
        },
      },
      orderBy: { addedAt: 'desc' },
    })
  },

  async findProduct(productId: string) {
    return db.product.findUnique({
      where: { id: productId },
      select: { id: true, isActive: true, publishedToStore: true },
    })
  },

  async findExisting(customerId: string, productId: string) {
    return db.favorite.findUnique({
      where: { customerId_productId: { customerId, productId } },
    })
  },

  async create(customerId: string, productId: string) {
    return db.favorite.create({ data: { customerId, productId } })
  },

  async delete(id: string) {
    return db.favorite.delete({ where: { id } })
  },
}

export { toNumber }
