import { NextRequest, NextResponse } from "next/server";
import { toNumber } from "@/lib/modules/accounting";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, parseQuery, validationError } from "@/lib/shared/validation";
import { createProductSchema, queryProductsSchema } from "@/lib/modules/accounting/schemas/products.schema";
import { createOutboxEvent } from "@/lib/events/outbox";
import { ProductService } from "@/lib/modules/accounting";

export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission("products:read");

    const query = parseQuery(request, queryProductsSchema);
    const { search, categoryId, active, published, hasDiscount, variantStatus, sortBy } = query;
    const sortOrder = query.sortOrder || "asc";
    const page = query.page || 1;
    const limit = query.limit || 50;

    const { products, total } = await ProductService.list(
      { search, categoryId, active, published, hasDiscount, variantStatus, sortBy, sortOrder, page, limit },
      session.tenantId
    );

    let enriched = products.map((p) => {
      const salePrice = p.salePrices[0]?.price ? toNumber(p.salePrices[0].price) : null;
      const discount = p.discounts[0] ?? null;
      let discountedPrice: number | null = null;
      if (salePrice != null && discount) {
        discountedPrice = discount.type === "percentage"
          ? salePrice * (1 - toNumber(discount.value) / 100)
          : salePrice - toNumber(discount.value);
        discountedPrice = Math.round(discountedPrice * 100) / 100;
      }
      return {
        ...p,
        purchasePrice: p.purchasePrices[0]?.price ? toNumber(p.purchasePrices[0].price) : null,
        salePrice,
        discountedPrice,
        discountValidTo: discount?.validTo ?? null,
        discountName: discount?.name ?? null,
        variantCount: p._count.variantLinksFrom,
        childVariantCount: p._count.childVariants,
        masterProduct: p.masterProduct,
      };
    });

    // Post-process sort for price fields
    if (sortBy === "purchasePrice" || sortBy === "salePrice") {
      enriched = enriched.sort((a, b) => {
        const aVal = toNumber(a[sortBy] as unknown as number | null) ?? (sortOrder === "asc" ? Infinity : -Infinity);
        const bVal = toNumber(b[sortBy] as unknown as number | null) ?? (sortOrder === "asc" ? Infinity : -Infinity);
        return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
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
    const session = await requirePermission("products:write");

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
      finalSku = await ProductService.generateSku(prefix);
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

    // P-create: product.create + outbox event are atomic — both inside one transaction.
    const product = await ProductService.$transaction(async (tx) => {
      const created = await ProductService.create({
        tenantId: session.tenantId,
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
        purchasePrice,
        salePrice,
      }, tx);

      await createOutboxEvent(
        tx,
        { type: "product.updated", occurredAt: new Date(), payload: { productId: created.id } },
        "Product",
        created.id
      );

      return created;
    });

    return NextResponse.json({
      ...product,
      purchasePrice: toNumber(product.purchasePrices[0]?.price) || null,
      salePrice: toNumber(product.salePrices[0]?.price) || null,
    }, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}
