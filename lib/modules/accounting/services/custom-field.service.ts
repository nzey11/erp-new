import 'server-only'
import { db } from '@/lib/shared/db'

export const CustomFieldService = {
  async list() {
    return db.customFieldDefinition.findMany({ where: { isActive: true }, orderBy: { order: 'asc' } })
  },

  async create(data: { name: string; fieldType: string; options?: string | null }) {
    const maxOrder = await db.customFieldDefinition.aggregate({ _max: { order: true } })
    const nextOrder = (maxOrder._max.order ?? -1) + 1
    return db.customFieldDefinition.create({
      data: { name: data.name, fieldType: data.fieldType, options: data.options || null, order: nextOrder },
    })
  },

  async update(id: string, updateData: Record<string, unknown>) {
    return db.customFieldDefinition.update({ where: { id }, data: updateData })
  },

  async softDelete(id: string) {
    return db.customFieldDefinition.update({ where: { id }, data: { isActive: false } })
  },
}
