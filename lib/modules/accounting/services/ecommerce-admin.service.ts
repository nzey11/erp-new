import 'server-only'
import { db, toNumber } from '@/lib/shared/db'

export const EcommerceAdminService = {
  // Orders
  async findDocumentStatus(id: string) {
    return db.document.findUnique({ where: { id }, select: { type: true, status: true } })
  },

  async findDocumentWithDetails(id: string) {
    return db.document.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true, phone: true, telegramUsername: true } },
        items: {
          include: {
            product: { select: { name: true, sku: true } },
            variant: { select: { id: true, option: { select: { value: true } } } },
          },
        },
      },
    })
  },

  // Promo blocks (public)
  async getActivePromoBlocks() {
    return db.promoBlock.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    })
  },

  async listPromoBlocks() {
    return db.promoBlock.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'desc' }] })
  },

  async createPromoBlock(data: {
    title: string
    subtitle?: string | null
    imageUrl: string
    linkUrl?: string | null
    order: number
    isActive: boolean
  }) {
    return db.promoBlock.create({ data })
  },

  async updatePromoBlock(id: string, data: {
    title?: string
    subtitle?: string | null
    imageUrl?: string
    linkUrl?: string | null
    order?: number
    isActive?: boolean
  }) {
    return db.promoBlock.update({ where: { id }, data })
  },

  async deletePromoBlock(id: string) {
    return db.promoBlock.delete({ where: { id } })
  },

  // Reviews
  async listReviews() {
    return db.review.findMany({
      include: {
        product: { select: { name: true, sku: true } },
        customer: { select: { name: true, phone: true, telegramUsername: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  },

  async updateReview(id: string, isPublished: boolean) {
    return db.review.update({
      where: { id },
      data: { isPublished },
      include: {
        product: { select: { name: true, sku: true } },
        customer: { select: { name: true, phone: true, telegramUsername: true } },
      },
    })
  },

  async deleteReview(id: string) {
    return db.review.delete({ where: { id } })
  },
}

export { toNumber }
