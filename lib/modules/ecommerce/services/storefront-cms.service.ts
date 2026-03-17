import 'server-only'
import { db } from '@/lib/shared/db'

export const StorefrontCmsService = {
  async listPublished(params: { showInFooter?: boolean; showInHeader?: boolean }) {
    const where: Record<string, unknown> = { isPublished: true }
    if (params.showInFooter) where.showInFooter = true
    if (params.showInHeader) where.showInHeader = true
    return db.storePage.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        sortOrder: true,
        showInFooter: true,
        showInHeader: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    })
  },

  async findBySlug(slug: string) {
    return db.storePage.findUnique({ where: { slug, isPublished: true } })
  },
}
