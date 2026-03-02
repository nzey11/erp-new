import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { parseQuery, validationError } from "@/lib/shared/validation";
import { queryStorefrontProductsSchema } from "@/lib/modules/ecommerce/schemas/products.schema";

/** GET /api/ecommerce/products — Public product listing */
export async function GET(request: NextRequest) {
  try {
    const { search, categoryId, minPrice, maxPrice, page = 1, limit = 20, sort } = parseQuery(
      request,
      queryStorefrontProductsSchema
    );

    const where: Record<string, unknown> = {
      isActive: true,
      publishedToStore: true,
      masterProductId: null, // Only show master products (not variants)
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { sku: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let orderBy: any = { name: "asc" };
    if (sort === "newest") orderBy = { createdAt: "desc" };
    if (sort === "price_asc" || sort === "price_desc") orderBy = { name: "asc" }; // Sort after fetch for price

    const [products, total] = await Promise.all([
      db.product.findMany({
        where,
        include: {
          unit: { select: { id: true, shortName: true } },
          category: { select: { id: true, name: true } },
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
          variants: {
            where: { isActive: true },
            include: { option: { include: { variantType: true } } },
          },
          // Include child variants for master products
          childVariants: {
            where: { isActive: true, publishedToStore: true },
            select: {
              id: true,
              name: true,
              salePrices: {
                where: { isActive: true, priceListId: null },
                orderBy: { validFrom: "desc" },
                take: 1,
              },
            },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.product.count({ where }),
    ]);

    // Map to storefront-friendly format
    const data = products.map((p) => {
      const salePrice = p.salePrices[0]?.price || 0;
      const discount = p.discounts[0];
      let discountedPrice = salePrice;
      if (discount) {
        discountedPrice = discount.type === "percentage"
          ? salePrice * (1 - discount.value / 100)
          : salePrice - discount.value;
        discountedPrice = Math.max(0, discountedPrice);
      }

      const ratings = p.reviews.map((r) => r.rating);
      const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

      // Calculate price range from child variants
      let priceRange: { min: number; max: number } | null = null;
      const childVariantCount = p.childVariants.length;
      if (childVariantCount > 0) {
        const allPrices = [salePrice];
        p.childVariants.forEach((cv) => {
          const cvPrice = cv.salePrices[0]?.price;
          if (cvPrice) allPrices.push(cvPrice);
        });
        const minPriceVal = Math.min(...allPrices);
        const maxPriceVal = Math.max(...allPrices);
        if (minPriceVal !== maxPriceVal) {
          priceRange = { min: minPriceVal, max: maxPriceVal };
        }
      }

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        sku: p.sku,
        description: p.description,
        imageUrl: p.imageUrl,
        unit: p.unit,
        category: p.category,
        price: salePrice,
        discountedPrice: discount ? Math.round(discountedPrice * 100) / 100 : null,
        discount: discount ? { name: discount.name, type: discount.type, value: discount.value } : null,
        rating: Math.round(avgRating * 10) / 10,
        reviewCount: ratings.length,
        variants: p.variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          priceAdjustment: v.priceAdjustment,
          option: v.option.value,
          type: v.option.variantType.name,
        })),
        // Variant hierarchy info
        childVariantCount,
        priceRange,
        seoTitle: p.seoTitle,
        seoDescription: p.seoDescription,
      };
    });

    // Price filtering (post-fetch since price is in related table)
    let filtered = data;
    if (minPrice !== undefined) filtered = filtered.filter((p) => (p.discountedPrice || p.price) >= minPrice);
    if (maxPrice !== undefined) filtered = filtered.filter((p) => (p.discountedPrice || p.price) <= maxPrice);

    // Price sorting (post-fetch)
    if (sort === "price_asc") filtered.sort((a, b) => (a.discountedPrice || a.price) - (b.discountedPrice || b.price));
    if (sort === "price_desc") filtered.sort((a, b) => (b.discountedPrice || b.price) - (a.discountedPrice || a.price));

    return NextResponse.json({ data: filtered, total, page, limit });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    console.error("Ecommerce products error:", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}
