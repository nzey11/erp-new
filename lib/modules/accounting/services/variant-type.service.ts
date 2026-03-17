import 'server-only'
import { db } from '@/lib/shared/db'

export const VariantTypeService = {
  async list() {
    return db.variantType.findMany({
      where: { isActive: true },
      include: { options: { orderBy: { order: 'asc' } } },
      orderBy: { order: 'asc' },
    })
  },

  async create(data: { name: string }) {
    const maxOrder = await db.variantType.aggregate({ _max: { order: true } })
    const nextOrder = (maxOrder._max.order ?? -1) + 1
    return db.variantType.create({
      data: { name: data.name, order: nextOrder },
      include: { options: true },
    })
  },

  async update(id: string, updateData: Record<string, unknown>) {
    return db.variantType.update({
      where: { id },
      data: updateData,
      include: { options: { orderBy: { order: 'asc' } } },
    })
  },

  async softDelete(id: string) {
    return db.variantType.update({ where: { id }, data: { isActive: false } })
  },

  async createOption(variantTypeId: string, value: string) {
    const maxOrder = await db.variantOption.aggregate({ where: { variantTypeId }, _max: { order: true } })
    const nextOrder = (maxOrder._max.order ?? -1) + 1
    return db.variantOption.create({ data: { variantTypeId, value, order: nextOrder } })
  },

  async deleteOption(optionId: string) {
    return db.variantOption.delete({ where: { id: optionId } })
  },
}
