import 'server-only'
import { db, toNumber } from '@/lib/shared/db'

export const VariantGroupService = {
  async list(params: {
    search?: string
    categoryId?: string
    page?: number
    limit?: number
  }) {
    const { search, categoryId, page = 1, limit = 20 } = params

    const where: Record<string, unknown> = {
      isActive: true,
      childVariants: { some: { isActive: true } },
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { variantGroupName: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (categoryId) where.categoryId = categoryId

    const [masterProducts, total] = await Promise.all([
      db.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          childVariants: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              sku: true,
              imageUrl: true,
              publishedToStore: true,
              salePrices: { where: { isActive: true, priceListId: null }, orderBy: { validFrom: 'desc' }, take: 1, select: { price: true } },
              stockRecords: { select: { quantity: true } },
            },
          },
          salePrices: { where: { isActive: true, priceListId: null }, orderBy: { validFrom: 'desc' }, take: 1, select: { price: true } },
          stockRecords: { select: { quantity: true } },
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.product.count({ where }),
    ])

    return { masterProducts, total, page, limit }
  },
}

export { toNumber }
