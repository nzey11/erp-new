import 'server-only'
import { db, toNumber } from '@/lib/shared/db'
import { compare, hash } from 'bcryptjs'

export const CustomerService = {
  async findByTelegramId(telegramId: string) {
    return db.customer.findUnique({ where: { telegramId } })
  },

  async updateTelegramInfo(id: string, data: { telegramUsername?: string; name?: string }) {
    return db.customer.update({ where: { id }, data })
  },

  async create(data: { telegramId?: string; telegramUsername?: string; name?: string }) {
    return db.customer.create({ data })
  },

  async findByPhone(phone: string) {
    return db.customer.findFirst({ where: { phone } })
  },

  async createGuest(data: { telegramId?: string; name: string; phone: string }) {
    return db.customer.create({ data })
  },

  async findByEmail(email: string) {
    return db.customer.findUnique({ where: { email } })
  },

  async createWithPassword(data: { email: string; password: string; name?: string }) {
    const passwordHash = await hash(data.password, 10)
    return db.customer.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name || null,
      },
    })
  },

  async verifyPassword(customer: { passwordHash: string | null }, password: string): Promise<boolean> {
    if (!customer.passwordHash) return false
    return compare(password, customer.passwordHash)
  },

  async findProductVariant(variantId: string) {
    return db.productVariant.findUnique({ where: { id: variantId } })
  },

  async findPublishedProduct(productId: string) {
    return db.product.findFirst({
      where: { id: productId, isActive: true, publishedToStore: true },
      include: {
        salePrices: {
          where: {
            isActive: true,
            priceListId: null,
            validFrom: { lte: new Date() },
            OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
          },
          take: 1,
          orderBy: { validFrom: 'desc' },
        },
        discounts: {
          where: {
            isActive: true,
            validFrom: { lte: new Date() },
            OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
          },
          take: 1,
        },
      },
    })
  },

  async updateProfile(id: string, data: { name?: string; phone?: string; email?: string | null }) {
    return db.customer.update({
      where: { id },
      data,
      select: {
        id: true,
        telegramId: true,
        telegramUsername: true,
        name: true,
        phone: true,
        email: true,
        isActive: true,
      },
    })
  },

  async findTelegramIntegration() {
    return db.integration.findUnique({ where: { type: 'telegram' } })
  },
}

export { toNumber }
