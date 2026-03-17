import 'server-only'
import { db } from '@/lib/shared/db'

export const CategoryService = {
  async list() {
    return db.productCategory.findMany({
      where: { isActive: true },
      include: { children: { where: { isActive: true }, orderBy: { order: 'asc' } } },
      orderBy: { order: 'asc' },
    })
  },

  async create(data: { name: string; parentId?: string | null; order?: number }) {
    return db.productCategory.create({
      data: { name: data.name, parentId: data.parentId || null, order: data.order },
    })
  },

  async update(id: string, updateData: Record<string, unknown>) {
    return db.productCategory.update({ where: { id }, data: updateData })
  },

  async softDelete(id: string) {
    return db.productCategory.update({ where: { id }, data: { isActive: false } })
  },
}
