import 'server-only'
import { db } from '@/lib/shared/db'

export const AddressService = {
  async list(customerId: string) {
    return db.customerAddress.findMany({
      where: { customerId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    })
  },

  async findById(id: string) {
    return db.customerAddress.findUnique({ where: { id }, select: { customerId: true } })
  },

  async clearDefaults(customerId: string) {
    return db.customerAddress.updateMany({
      where: { customerId, isDefault: true },
      data: { isDefault: false },
    })
  },

  async clearDefaultsExcluding(customerId: string, excludeId: string) {
    return db.customerAddress.updateMany({
      where: { customerId, isDefault: true, id: { not: excludeId } },
      data: { isDefault: false },
    })
  },

  async create(data: {
    customerId: string
    label?: string
    recipientName: string
    phone: string
    city: string
    street: string
    building: string
    apartment?: string | null
    postalCode?: string | null
    isDefault: boolean
  }) {
    return db.customerAddress.create({ data })
  },

  async update(id: string, data: Record<string, unknown>) {
    return db.customerAddress.update({ where: { id }, data })
  },

  async delete(id: string) {
    return db.customerAddress.delete({ where: { id } })
  },
}
