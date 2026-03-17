import { NextRequest, NextResponse } from "next/server";
import { db, toNumber } from "@/lib/shared/db";
import { logger } from "@/lib/shared/logger";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // Find the product by slug or id
    const product = await db.product.findFirst({
      where: {
        OR: [{ slug }, { id: slug }],
        isActive: true,
        publishedToStore: true,
      },
      select: { id: true, categoryId: true },
    });

    if (!product) {
      return NextResponse.json({ data: [] });
    }

    const where: Record<string, unknown> = {
      isActive: true,
      publishedToStore: true,
      masterProductId: null,
      id: { not: product.id },
    };

    if (product.categoryId) {
      where.categoryId = product.categoryId;
    }

    const related = await db.product.findMany({
      where,
      take: 6,
      orderBy: { createdAt: "desc" },
      include: {
        salePrices: {
          where: {
            isActive: true,
            priceListId: null,
            validFrom: { lte: new Date() },
            OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
          },
          take: 1,
          orderBy: { validFrom: "desc" },
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
        unit: { select: { shortName: true } },
      },
    });

    const data = related.map((p) => {
      const basePrice = toNumber(p.salePrices[0]?.price) || 0;
      const discount = p.discounts[0];
      let discountedPrice: number | null = null;

      if (discount) {
        if (discount.type === "percentage") {
          discountedPrice = Math.round(basePrice * (1 - toNumber(discount.value) / 100) * 100) / 100;
        } else {
          discountedPrice = Math.max(0, Math.round((basePrice - toNumber(discount.value)) * 100) / 100);
        }
      }

      const avgRating = p.reviews.length > 0
        ? Math.round((p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length) * 10) / 10
        : 0;

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        imageUrl: p.imageUrl,
        price: basePrice,
        discountedPrice,
        discount: discount ? { name: discount.name, type: discount.type, value: discount.value } : null,
        rating: avgRating,
        reviewCount: p.reviews.length,
        unit: { shortName: p.unit.shortName },
      };
    });

    return NextResponse.json({ data });
  } catch (error) {
    logger.error("related-products", "Failed to fetch related products", error);
    return NextResponse.json({ data: [] });
  }
}
