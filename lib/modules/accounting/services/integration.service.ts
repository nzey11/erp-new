import 'server-only'
import { db } from '@/lib/shared/db'
import { Prisma } from '@/lib/generated/prisma/client'

export const IntegrationService = {
  async listAll() {
    return db.integration.findMany({ orderBy: { createdAt: 'asc' } })
  },

  async findByType(type: string) {
    return db.integration.findUnique({ where: { type } })
  },

  async upsert(type: string, data: { name: string; settings: Record<string, unknown>; isEnabled: boolean }) {
    const settings = data.settings as Prisma.InputJsonValue
    return db.integration.upsert({
      where: { type },
      create: { type, name: data.name, isEnabled: data.isEnabled, settings },
      update: { settings, isEnabled: data.isEnabled },
    })
  },

  async disable(type: string) {
    return db.integration.update({ where: { type }, data: { isEnabled: false } })
  },
}
