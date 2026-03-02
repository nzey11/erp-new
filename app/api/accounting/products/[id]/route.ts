import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { updateProductSchema } from "@/lib/modules/accounting/schemas/products.schema";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission("products:read");
    const { id } = await params;

    const product = await db.product.findUnique({
      where: { id },
      include: {
        unit: true,
        category: true,
        stockRecords: { include: { warehouse: { select: { id: true, name: true } } } },
        purchasePrices: { where: { isActive: true }, orderBy: { validFrom: "desc" }, take: 1 },
        salePrices: { where: { isActive: true, priceListId: null }, orderBy: { validFrom: "desc" }, take: 1 },
        customFields: { include: { definition: true } },
        variants: {
          where: { isActive: true },
          include: { option: { include: { variantType: { select: { id: true, name: true } } } } },
        },
        discounts: { where: { isActive: true }, orderBy: { createdAt: "desc" } },
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    return NextResponse.json({
      ...product,
      purchasePrice: product.purchasePrices[0]?.price ?? null,
      salePrice: product.salePrices[0]?.price ?? null,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("products:write");
    const { id } = await params;
    const data = await parseBody(request, updateProductSchema);
    const {
      name, sku, barcode, description, unitId, categoryId, imageUrl, isActive,
      purchasePrice, salePrice,
      seoTitle, seoDescription, seoKeywords, slug,
      publishedToStore,
    } = data;

    const product = await db.product.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(sku !== undefined && { sku: sku || null }),
        ...(barcode !== undefined && { barcode: barcode || null }),
        ...(description !== undefined && { description }),
        ...(unitId !== undefined && { unitId }),
        ...(categoryId !== undefined && { categoryId: categoryId || null }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(isActive !== undefined && { isActive }),
        ...(seoTitle !== undefined && { seoTitle: seoTitle || null }),
        ...(seoDescription !== undefined && { seoDescription: seoDescription || null }),
        ...(seoKeywords !== undefined && { seoKeywords: seoKeywords || null }),
        ...(slug !== undefined && { slug: slug || null }),
        ...(publishedToStore !== undefined && { publishedToStore: !!publishedToStore }),
      },
      include: {
        unit: { select: { id: true, shortName: true } },
        category: { select: { id: true, name: true } },
      },
    });

    // Update purchase price if provided
    if (purchasePrice !== undefined) {
      await db.purchasePrice.updateMany({ where: { productId: id, isActive: true }, data: { isActive: false } });
      if (purchasePrice != null && purchasePrice !== "") {
        await db.purchasePrice.create({ data: { productId: id, price: parseFloat(String(purchasePrice)), isActive: true } });
      }
    }

    // Update sale price if provided
    if (salePrice !== undefined) {
      await db.salePrice.updateMany({ where: { productId: id, isActive: true }, data: { isActive: false } });
      if (salePrice != null && salePrice !== "") {
        await db.salePrice.create({ data: { productId: id, price: parseFloat(String(salePrice)), isActive: true } });
      }
    }

    return NextResponse.json(product);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission("products:write");
    const { id } = await params;

    await db.product.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAuthError(error);
  }
}
