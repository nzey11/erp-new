import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, parseQuery, validationError } from "@/lib/shared/validation";
import { createProductSchema, queryProductsSchema } from "@/lib/modules/accounting/schemas/products.schema";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("products:read");

    const query = parseQuery(request, queryProductsSchema);
    const { search, categoryId, active, published, hasDiscount, variantStatus, sortBy } = query;
    const sortOrder = query.sortOrder || "asc";
    const page = query.page || 1;
    const limit = query.limit || 50;

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { sku: { contains: search } },
        { barcode: { contains: search } },
      ];
    }
    if (categoryId) where.categoryId = categoryId;
    if (active) where.isActive = active === "true";
    if (published) where.publishedToStore = published === "true";
    if (hasDiscount === "true") {
      where.discounts = {
        some: {
          isActive: true,
          OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
        },
      };
    }
    // Variant status filter
    if (variantStatus === "masters") {
      // Products that have child variants but are not variants themselves
      where.masterProductId = null;
      where.childVariants = { some: { isActive: true } };
    } else if (variantStatus === "variants") {
      // Products that are variants of another product
      where.masterProductId = { not: null };
    } else if (variantStatus === "unlinked") {
      // Products with no variant relationships at all
      where.masterProductId = null;
      where.childVariants = { none: {} };
    }

    // Build orderBy based on sortBy field
    let orderBy: Record<string, string> | Record<string, Record<string, string>> = { name: sortOrder };
    if (sortBy === "sku") {
      orderBy = { sku: sortOrder };
    } else if (sortBy === "createdAt") {
      orderBy = { createdAt: sortOrder };
    }
    // Note: purchasePrice and salePrice sorting requires post-processing since they come from relations

    const [products, total] = await Promise.all([
      db.product.findMany({
        where,
        include: {
          unit: { select: { id: true, shortName: true } },
          category: { select: { id: true, name: true } },
          purchasePrices: {
            where: { isActive: true },
            orderBy: { validFrom: "desc" },
            take: 1,
            select: { price: true },
          },
          salePrices: {
            where: { isActive: true, priceListId: null }, // Only default prices, not from price lists
            orderBy: { validFrom: "desc" },
            take: 1,
            select: { price: true },
          },
          discounts: {
            where: {
              isActive: true,
              OR: [
                { validTo: null },
                { validTo: { gte: new Date() } },
              ],
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          _count: {
            select: {
              variantLinksFrom: { where: { isActive: true } },
              childVariants: { where: { isActive: true } },
            },
          },
          // Variant hierarchy
          masterProduct: {
            select: { id: true, name: true },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.product.count({ where }),
    ]);

    let enriched = products.map((p) => {
      const salePrice = p.salePrices[0]?.price ?? null;
      const discount = p.discounts[0] ?? null;
      let discountedPrice: number | null = null;
      if (salePrice != null && discount) {
        discountedPrice = discount.type === "percentage"
          ? salePrice * (1 - discount.value / 100)
          : salePrice - discount.value;
        discountedPrice = Math.round(discountedPrice * 100) / 100;
      }
      return {
        ...p,
        purchasePrice: p.purchasePrices[0]?.price ?? null,
        salePrice,
        discountedPrice,
        discountValidTo: discount?.validTo ?? null,
        discountName: discount?.name ?? null,
        variantCount: p._count.variantLinksFrom,
        // Variant hierarchy fields
        childVariantCount: p._count.childVariants,
        masterProduct: p.masterProduct,
      };
    });

    // Post-process sort for price fields (cannot sort by relation in Prisma directly)
    if (sortBy === "purchasePrice" || sortBy === "salePrice") {
      enriched = enriched.sort((a, b) => {
        const aVal = a[sortBy] ?? (sortOrder === "asc" ? Infinity : -Infinity);
        const bVal = b[sortBy] ?? (sortOrder === "asc" ? Infinity : -Infinity);
        return sortOrder === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
      });
    }

    return NextResponse.json({ data: enriched, total, page, limit });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission("products:write");

    const data = await parseBody(request, createProductSchema);
    const {
      name, sku, barcode, description, unitId, categoryId, imageUrl,
      purchasePrice, salePrice,
      seoTitle, seoDescription, seoKeywords, slug,
      autoSku, publishedToStore,
    } = data;

    // Auto-generate SKU if requested
    let finalSku = sku || null;
    if (autoSku && !sku) {
      const prefix = (typeof autoSku === "string" && autoSku) || "SKU";
      const counter = await db.skuCounter.upsert({
        where: { prefix },
        create: { prefix, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });
      finalSku = `${prefix}-${String(counter.lastNumber).padStart(6, "0")}`;
    }

    // Auto-generate slug from name if not provided
    const finalSlug = slug || name.toLowerCase()
      .replace(/[а-яё]/gi, (c: string) => {
        const map: Record<string, string> = {
          а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',
          й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',
          у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',
          ь:'',э:'e',ю:'yu',я:'ya',
        };
        return map[c.toLowerCase()] || c;
      })
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      || null;

    const product = await db.product.create({
      data: {
        name,
        sku: finalSku,
        barcode: barcode || null,
        description,
        unitId,
        categoryId: categoryId || null,
        imageUrl,
        seoTitle: seoTitle || null,
        seoDescription: seoDescription || null,
        seoKeywords: seoKeywords || null,
        slug: finalSlug,
        ...(publishedToStore !== undefined && { publishedToStore: !!publishedToStore }),
        ...(purchasePrice != null && purchasePrice !== "" && {
          purchasePrices: { create: { price: parseFloat(String(purchasePrice)), isActive: true } },
        }),
        ...(salePrice != null && salePrice !== "" && {
          salePrices: { create: { price: parseFloat(String(salePrice)), isActive: true } },
        }),
      },
      include: {
        unit: { select: { id: true, shortName: true } },
        category: { select: { id: true, name: true } },
        purchasePrices: { where: { isActive: true }, orderBy: { validFrom: "desc" }, take: 1, select: { price: true } },
        salePrices: { where: { isActive: true, priceListId: null }, orderBy: { validFrom: "desc" }, take: 1, select: { price: true } },
      },
    });

    return NextResponse.json({
      ...product,
      purchasePrice: product.purchasePrices[0]?.price ?? null,
      salePrice: product.salePrices[0]?.price ?? null,
    }, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}
