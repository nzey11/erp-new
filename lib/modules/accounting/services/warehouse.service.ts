import 'server-only'
import { db } from '@/lib/shared/db'

export const WarehouseService = {
  async list(tenantId: string, active?: string | null) {
    const where: Record<string, unknown> = { tenantId }
    if (active !== null && active !== undefined && active !== '') {
      where.isActive = active === 'true'
    }
    return db.warehouse.findMany({ where, orderBy: { name: 'asc' } })
  },

  async findById(id: string, tenantId: string) {
    return db.warehouse.findFirst({
      where: { id, tenantId },
      include: {
        stockRecords: {
          where: { quantity: { not: 0 } },
          include: { product: { select: { id: true, name: true, sku: true } } },
          orderBy: { product: { name: 'asc' } },
        },
      },
    })
  },

  async getTenantGate(id: string, tenantId: string) {
    return db.warehouse.findFirst({ where: { id, tenantId } })
  },

  async create(data: {
    tenantId: string
    name: string
    address?: string | null
    responsibleName?: string | null
  }) {
    return db.warehouse.create({
      data: {
        tenantId: data.tenantId,
        name: data.name,
        address: data.address || null,
        responsibleName: data.responsibleName || null,
      },
    })
  },

  async update(id: string, updateData: Record<string, unknown>) {
    return db.warehouse.update({ where: { id }, data: updateData })
  },

  async softDelete(id: string) {
    return db.warehouse.update({ where: { id }, data: { isActive: false } })
  },
}
