import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requireCustomer, handleCustomerAuthError } from "@/lib/shared/customer-auth";
import { parseBody, validationError } from "@/lib/shared/validation";
import { addFavoriteSchema } from "@/lib/modules/ecommerce/schemas/favorites.schema";

/** GET /api/ecommerce/favorites — Get customer favorites */
export async function GET() {
  try {
    const customer = await requireCustomer();

    const favorites = await db.favorite.findMany({
      where: { customerId: customer.id },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            imageUrl: true,
            isActive: true,
            publishedToStore: true,
            unit: { select: { shortName: true } },
            salePrices: {
              where: { isActive: true, priceListId: null },
              orderBy: { validFrom: "desc" },
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
            reviews: {
              where: { isPublished: true },
              select: { rating: true },
            },
          },
        },
      },
      orderBy: { addedAt: "desc" },
    });

    const items = favorites
      .filter((f) => f.product.isActive && f.product.publishedToStore)
      .map((fav) => {
        const product = fav.product;
        const salePrice = product.salePrices[0]?.price || 0;
        const discount = product.discounts[0];
        let discountedPrice = salePrice;
        if (discount) {
          discountedPrice =
            discount.type === "percentage"
              ? salePrice * (1 - discount.value / 100)
              : salePrice - discount.value;
          discountedPrice = Math.max(0, discountedPrice);
        }

        const ratings = product.reviews.map((r) => r.rating);
        const avgRating =
          ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

        return {
          id: fav.id,
          productId: product.id,
          productName: product.name,
          productSlug: product.slug,
          productImageUrl: product.imageUrl,
          price: salePrice,
          discountedPrice: discount ? Math.round(discountedPrice * 100) / 100 : null,
          discount: discount
            ? { name: discount.name, type: discount.type, value: discount.value }
            : null,
          rating: Math.round(avgRating * 10) / 10,
          reviewCount: ratings.length,
          unitShortName: product.unit.shortName,
          addedAt: fav.addedAt,
        };
      });

    return NextResponse.json({ items });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleCustomerAuthError(error);
  }
}

/** POST /api/ecommerce/favorites — Add product to favorites */
export async function POST(request: NextRequest) {
  try {
    const customer = await requireCustomer();
    const { productId } = await parseBody(request, addFavoriteSchema);

    // Verify product exists
    const product = await db.product.findUnique({
      where: { id: productId },
      select: { id: true, isActive: true, publishedToStore: true },
    });

    if (!product || !product.isActive || !product.publishedToStore) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Check if already favorited
    const existing = await db.favorite.findUnique({
      where: {
        customerId_productId: {
          customerId: customer.id,
          productId,
        },
      },
    });

    if (existing) {
      return NextResponse.json({ message: "Already in favorites" });
    }

    await db.favorite.create({
      data: {
        customerId: customer.id,
        productId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleCustomerAuthError(error);
  }
}

/** DELETE /api/ecommerce/favorites?productId=xxx — Remove favorite */
export async function DELETE(request: NextRequest) {
  try {
    const customer = await requireCustomer();
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");

    if (!productId) {
      return NextResponse.json({ error: "Missing productId" }, { status: 400 });
    }

    const favorite = await db.favorite.findUnique({
      where: {
        customerId_productId: {
          customerId: customer.id,
          productId,
        },
      },
    });

    if (!favorite) {
      return NextResponse.json({ error: "Favorite not found" }, { status: 404 });
    }

    await db.favorite.delete({
      where: { id: favorite.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleCustomerAuthError(error);
  }
}
