import { db } from "@/lib/shared/db";

/** Add item to cart or update quantity if exists */
export async function addToCart(
  customerId: string,
  productId: string,
  variantId: string | null,
  quantity: number,
  priceSnapshot: number
) {
  const existing = await db.cartItem.findUnique({
    where: {
      customerId_productId_variantId: {
        customerId,
        productId,
        variantId: variantId || "",
      },
    },
  });

  if (existing) {
    return db.cartItem.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + quantity, priceSnapshot },
    });
  }

  return db.cartItem.create({
    data: {
      customerId,
      productId,
      variantId: variantId || null,
      quantity,
      priceSnapshot,
    },
  });
}

/** Calculate cart totals */
export async function calculateCartTotal(customerId: string) {
  const items = await db.cartItem.findMany({
    where: { customerId },
    include: {
      product: {
        include: {
          salePrices: { where: { isActive: true, priceListId: null }, orderBy: { validFrom: "desc" }, take: 1 },
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
  });

  let subtotal = 0;
  for (const item of items) {
    let price = item.product.salePrices[0]?.price || 0;
    if (item.variant) price += item.variant.priceAdjustment;
    const discount = item.product.discounts[0];
    if (discount) {
      price = discount.type === "percentage" ? price * (1 - discount.value / 100) : price - discount.value;
      price = Math.max(0, price);
    }
    subtotal += price * item.quantity;
  }

  return { subtotal: Math.round(subtotal * 100) / 100, itemCount: items.length };
}

/** Validate stock availability for all cart items */
export async function validateCartStock(customerId: string): Promise<{ valid: boolean; issues: string[] }> {
  const items = await db.cartItem.findMany({
    where: { customerId },
    include: {
      product: {
        include: { stockRecords: { select: { quantity: true } } },
      },
    },
  });

  const issues: string[] = [];
  for (const item of items) {
    const totalStock = item.product.stockRecords.reduce((sum, r) => sum + r.quantity, 0);
    if (totalStock < item.quantity) {
      issues.push(`${item.product.name}: в наличии ${totalStock}, в корзине ${item.quantity}`);
    }
  }

  return { valid: issues.length === 0, issues };
}
