import 'server-only'
import { db } from '@/lib/shared/db'

export const UnitService = {
  async list() {
    return db.unit.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } })
  },

  async create(data: { name: string; shortName: string }) {
    return db.unit.create({ data: { name: data.name, shortName: data.shortName } })
  },

  async update(id: string, updateData: Record<string, unknown>) {
    return db.unit.update({ where: { id }, data: updateData })
  },

  async softDelete(id: string) {
    return db.unit.update({ where: { id }, data: { isActive: false } })
  },
}
