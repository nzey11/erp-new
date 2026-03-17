import 'server-only'
import { db, toNumber } from '@/lib/shared/db'

export const CartService = {
  async getCartItems(customerId: string) {
    return db.cartItem.findMany({
      where: { customerId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            slug: true,
            unit: { select: { shortName: true } },
          },
        },
        variant: {
          select: {
            id: true,
            option: { select: { value: true } },
          },
        },
      },
      orderBy: { addedAt: 'desc' },
    })
  },

  async getProductForCart(productId: string, variantId?: string | null) {
    return db.product.findUnique({
      where: { id: productId },
      include: {
        salePrices: {
          where: { isActive: true, priceListId: null },
          orderBy: { validFrom: 'desc' },
          take: 1,
        },
        discounts: {
          where: {
            isActive: true,
            validFrom: { lte: new Date() },
            OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
          },
          take: 1,
        },
        variants: {
          where: { id: variantId || 'none' },
          take: 1,
        },
      },
    })
  },

  async findCartItemByVariant(customerId: string, productId: string, variantId: string) {
    return db.cartItem.findUnique({
      where: {
        customerId_productId_variantId: { customerId, productId, variantId },
      },
    })
  },

  async findCartItemNoVariant(customerId: string, productId: string) {
    return db.cartItem.findFirst({
      where: { customerId, productId, variantId: null },
    })
  },

  async updateCartItem(id: string, quantity: number, priceSnapshot: number) {
    return db.cartItem.update({ where: { id }, data: { quantity, priceSnapshot } })
  },

  async createCartItem(data: {
    customerId: string
    productId: string
    variantId: string | null
    quantity: number
    priceSnapshot: number
  }) {
    return db.cartItem.create({ data })
  },

  async findCartItemById(id: string) {
    return db.cartItem.findUnique({ where: { id }, select: { customerId: true } })
  },

  async deleteCartItem(id: string) {
    return db.cartItem.delete({ where: { id } })
  },

  async getCartItemsForCheckout(customerId: string) {
    return db.cartItem.findMany({
      where: { customerId },
      include: {
        product: {
          include: {
            salePrices: {
              where: { isActive: true, priceListId: null },
              orderBy: { validFrom: 'desc' },
              take: 1,
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
        },
        variant: true,
      },
    })
  },

  async clearCart(customerId: string) {
    return db.cartItem.deleteMany({ where: { customerId } })
  },
}

export { toNumber }
