import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { validationError } from "@/lib/shared/validation";

/** GET /api/ecommerce/products/[slug] — Product detail by slug */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const product = await db.product.findFirst({
      where: { slug, isActive: true, publishedToStore: true },
      include: {
        unit: { select: { id: true, name: true, shortName: true } },
        category: { select: { id: true, name: true } },
        salePrices: {
          where: { isActive: true, priceListId: null },
          orderBy: { validFrom: "desc" },
          take: 1,
        },
        purchasePrices: {
          where: { isActive: true },
          orderBy: { validFrom: "desc" },
          take: 1,
          select: { price: true },
        },
        discounts: {
          where: {
            isActive: true,
            validFrom: { lte: new Date() },
            OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
          },
        },
        customFields: {
          include: { definition: true },
        },
        variants: {
          where: { isActive: true },
          include: { option: { include: { variantType: true } } },
          orderBy: { createdAt: "asc" },
        },
        variantLinksFrom: {
          where: { isActive: true },
          include: {
            linkedProduct: {
              select: {
                id: true,
                name: true,
                slug: true,
                imageUrl: true,
                publishedToStore: true,
                isActive: true,
              },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
        reviews: {
          where: { isPublished: true },
          include: {
            customer: { select: { name: true, telegramUsername: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        stockRecords: {
          select: { quantity: true },
        },
        // Variant hierarchy: include master product if this is a variant
        masterProduct: {
          select: {
            id: true,
            name: true,
            slug: true,
            imageUrl: true,
          },
        },
        // Variant hierarchy: include child variants if this is a master
        childVariants: {
          where: { isActive: true, publishedToStore: true },
          select: {
            id: true,
            name: true,
            slug: true,
            imageUrl: true,
            salePrices: {
              where: { isActive: true, priceListId: null },
              orderBy: { validFrom: "desc" },
              take: 1,
            },
            stockRecords: {
              select: { quantity: true },
            },
          },
        },
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const salePrice = product.salePrices[0]?.price || 0;
    const discount = product.discounts[0] || null;
    let discountedPrice = salePrice;
    if (discount) {
      discountedPrice = discount.type === "percentage"
        ? salePrice * (1 - discount.value / 100)
        : salePrice - discount.value;
      discountedPrice = Math.max(0, discountedPrice);
    }

    const totalStock = product.stockRecords.reduce((sum, r) => sum + r.quantity, 0);
    const ratings = product.reviews.map((r) => r.rating);
    const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

    // Filter variant links to only active/published products
    const variantLinks = product.variantLinksFrom
      .filter((vl) => vl.linkedProduct.isActive && vl.linkedProduct.publishedToStore)
      .map((vl) => ({
        groupName: vl.groupName,
        product: {
          id: vl.linkedProduct.id,
          name: vl.linkedProduct.name,
          slug: vl.linkedProduct.slug,
          imageUrl: vl.linkedProduct.imageUrl,
        },
      }));

    // Process child variants for master products
    const childVariants = product.childVariants.map((cv) => {
      const cvPrice = cv.salePrices[0]?.price || 0;
      const cvStock = cv.stockRecords.reduce((sum, r) => sum + r.quantity, 0);
      return {
        id: cv.id,
        name: cv.name,
        slug: cv.slug,
        imageUrl: cv.imageUrl,
        price: cvPrice,
        inStock: cvStock > 0,
      };
    });

    // Calculate price range from child variants
    let priceRange: { min: number; max: number } | null = null;
    if (childVariants.length > 0) {
      const allPrices = [salePrice, ...childVariants.map((cv) => cv.price)].filter((p) => p > 0);
      if (allPrices.length > 1) {
        const minPriceVal = Math.min(...allPrices);
        const maxPriceVal = Math.max(...allPrices);
        if (minPriceVal !== maxPriceVal) {
          priceRange = { min: minPriceVal, max: maxPriceVal };
        }
      }
    }

    return NextResponse.json({
      id: product.id,
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      barcode: product.barcode,
      description: product.description,
      imageUrl: product.imageUrl,
      imageUrls: Array.isArray(product.imageUrls) ? product.imageUrls : product.imageUrl ? [product.imageUrl] : [],
      unit: product.unit,
      category: product.category,
      price: salePrice,
      discountedPrice: discount ? Math.round(discountedPrice * 100) / 100 : null,
      discount: discount ? { name: discount.name, type: discount.type, value: discount.value } : null,
      inStock: totalStock > 0 || childVariants.some((cv) => cv.inStock),
      stockQuantity: totalStock,
      rating: Math.round(avgRating * 10) / 10,
      reviewCount: ratings.length,
      characteristics: product.customFields.map((cf) => ({
        name: cf.definition.name,
        value: cf.value,
        type: cf.definition.fieldType,
      })),
      variants: product.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        priceAdjustment: v.priceAdjustment,
        option: v.option.value,
        type: v.option.variantType.name,
      })),
      variantLinks,
      // Variant hierarchy info
      masterProduct: product.masterProduct,
      childVariants,
      childVariantCount: childVariants.length,
      priceRange,
      reviews: product.reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        title: r.title,
        comment: r.comment,
        isVerifiedPurchase: r.isVerifiedPurchase,
        customerName: r.customer.name || r.customer.telegramUsername || "Покупатель",
        createdAt: r.createdAt,
      })),
      seo: {
        title: product.seoTitle || product.name,
        description: product.seoDescription || product.description,
        keywords: product.seoKeywords,
      },
    });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    console.error("Product detail error:", error);
    return NextResponse.json({ error: "Failed to fetch product" }, { status: 500 });
  }
}
