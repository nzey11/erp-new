import 'server-only'
import { db } from '@/lib/shared/db'

export const CmsPageService = {
  async list(search?: string) {
    return db.storePage.findMany({
      where: search ? { title: { contains: search, mode: 'insensitive' } } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    })
  },

  async findById(id: string) {
    return db.storePage.findUnique({ where: { id } })
  },

  async findBySlug(slug: string) {
    return db.storePage.findUnique({ where: { slug } })
  },

  async findBySlugExcluding(slug: string, excludeId: string) {
    return db.storePage.findFirst({ where: { slug, id: { not: excludeId } } })
  },

  async create(data: {
    title: string
    slug: string
    content: string
    seoTitle?: string | null
    seoDescription?: string | null
    isPublished: boolean
    sortOrder: number
    showInFooter: boolean
    showInHeader: boolean
  }) {
    return db.storePage.create({ data })
  },

  async update(id: string, updateData: Record<string, unknown>) {
    return db.storePage.update({ where: { id }, data: updateData })
  },

  async delete(id: string) {
    return db.storePage.delete({ where: { id } })
  },
}
