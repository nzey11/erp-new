import 'server-only'
import { db } from '@/lib/shared/db'

export const StorefrontCategoryService = {
  async listPublished() {
    return db.productCategory.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { order: 'asc' },
          select: { id: true, name: true, parentId: true, order: true },
        },
        _count: {
          select: {
            products: { where: { isActive: true, publishedToStore: true } },
          },
        },
      },
    })
  },
}
