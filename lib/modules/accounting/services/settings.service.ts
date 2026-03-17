import 'server-only'
import { db } from '@/lib/shared/db'

export const SettingsService = {
  async getOrCreate(tenantId: string) {
    let settings = await db.tenantSettings.findUnique({ where: { tenantId } })
    if (!settings) {
      settings = await db.tenantSettings.create({ data: { tenantId, name: 'Моя компания' } })
    }
    return settings
  },

  async findByTenantId(tenantId: string) {
    return db.tenantSettings.findUnique({ where: { tenantId } })
  },

  async update(tenantId: string, data: {
    name?: string
    inn?: string | null
    kpp?: string | null
    ogrn?: string | null
    phone?: string | null
    address?: string | null
    fiscalYearStartMonth?: number
  }) {
    return db.tenantSettings.update({ where: { tenantId }, data })
  },

  async create(tenantId: string, data: {
    name?: string
    inn?: string | null
    kpp?: string | null
    ogrn?: string | null
  }) {
    return db.tenantSettings.create({
      data: { tenantId, name: data.name ?? 'Моя компания', inn: data.inn, kpp: data.kpp, ogrn: data.ogrn },
    })
  },
}
