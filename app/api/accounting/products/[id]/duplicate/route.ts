import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission("products:write");
    const { id } = await params;

    // Fetch the source product with relations to copy
    const source = await db.product.findUnique({
      where: { id },
      include: {
        customFields: { include: { definition: true } },
        purchasePrices: { where: { isActive: true }, orderBy: { validFrom: "desc" }, take: 1 },
        salePrices: { where: { isActive: true, priceListId: null }, orderBy: { validFrom: "desc" }, take: 1 },
      },
    });

    if (!source) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    // Verify source product belongs to user's tenant
    if (source.tenantId && source.tenantId !== session.tenantId) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    // Create the duplicated product
    const duplicated = await db.product.create({
      data: {
        tenantId: source.tenantId || session.tenantId, // Inherit tenant from source or use session
        name: `${source.name} (копия)`,
        sku: null, // SKU should be unique, so we don't copy it
        barcode: null, // Barcode should be unique too
        description: source.description,
        unitId: source.unitId,
        categoryId: source.categoryId,
        imageUrl: source.imageUrl,
        isActive: true,
        publishedToStore: false, // Don't auto-publish duplicates
        seoTitle: source.seoTitle,
        seoDescription: source.seoDescription,
        seoKeywords: source.seoKeywords,
        slug: null, // Slug should be unique
        // Copy custom fields
        customFields: {
          create: source.customFields.map((cf) => ({
            definitionId: cf.definitionId,
            value: cf.value,
          })),
        },
        // Copy default prices
        ...(source.purchasePrices[0] && {
          purchasePrices: {
            create: { price: source.purchasePrices[0].price, currency: source.purchasePrices[0].currency, isActive: true },
          },
        }),
        ...(source.salePrices[0] && {
          salePrices: {
            create: { price: source.salePrices[0].price, currency: source.salePrices[0].currency, isActive: true },
          },
        }),
      },
      include: {
        unit: { select: { id: true, shortName: true } },
        category: { select: { id: true, name: true } },
        purchasePrices: { where: { isActive: true }, orderBy: { validFrom: "desc" }, take: 1 },
        salePrices: { where: { isActive: true }, orderBy: { validFrom: "desc" }, take: 1 },
      },
    });

    return NextResponse.json({
      ...duplicated,
      purchasePrice: duplicated.purchasePrices[0]?.price ?? null,
      salePrice: duplicated.salePrices[0]?.price ?? null,
      discountedPrice: null,
      discountValidTo: null,
      discountName: null,
      variantCount: 0,
    }, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}
