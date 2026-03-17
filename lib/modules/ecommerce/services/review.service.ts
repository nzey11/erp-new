import 'server-only'
import { db } from '@/lib/shared/db'

export const ReviewService = {
  async findProduct(productId: string) {
    return db.product.findUnique({
      where: { id: productId },
      select: { id: true, isActive: true, publishedToStore: true },
    })
  },

  async findExistingReview(productId: string, customerId: string) {
    return db.review.findFirst({ where: { productId, customerId } })
  },

  async findVerifiedPurchase(orderId: string, productId: string, customerId: string) {
    return db.document.findFirst({
      where: {
        id: orderId,
        type: 'sales_order',
        customerId,
        status: { in: ['confirmed', 'shipped', 'delivered'] },
        items: { some: { productId } },
      },
    })
  },

  async create(data: {
    productId: string
    customerId: string
    documentId?: string | null
    rating: number
    title?: string | null
    comment?: string | null
    isVerifiedPurchase: boolean
    isPublished: boolean
  }) {
    return db.review.create({ data })
  },
}
