import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { updateProductSchema } from "@/lib/modules/accounting/schemas/products.schema";
import { createOutboxEvent } from "@/lib/events/outbox";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission("products:read");
    const { id } = await params;

    const product = await db.product.findFirst({
      where: { id, tenantId: session.tenantId },
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
    const session = await requirePermission("products:write");
    const { id } = await params;

    // R1-03: ownership check — returns 404 for cross-tenant or nonexistent product
    const owned = await db.product.findFirst({ where: { id, tenantId: session.tenantId } });
    if (!owned) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    const data = await parseBody(request, updateProductSchema);
    const {
      name, sku, barcode, description, unitId, categoryId, imageUrl, isActive,
      purchasePrice, salePrice,
      seoTitle, seoDescription, seoKeywords, slug,
      publishedToStore,
    } = data;

    // P2-01: product.update + outbox event are atomic — both inside one transaction.
    // purchasePrice and salePrice updates remain outside (their own events: P2-02).
    const product = await db.$transaction(async (tx) => {
      const updated = await tx.product.update({
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

      await createOutboxEvent(
        tx,
        { type: "product.updated", occurredAt: new Date(), payload: { productId: id } },
        "Product",
        id
      );

      return updated;
    });

    // Update purchase price if provided (no projection event — purchasePrice is not displayed in storefront)
    if (purchasePrice !== undefined) {
      await db.purchasePrice.updateMany({ where: { productId: id, isActive: true }, data: { isActive: false } });
      if (purchasePrice != null && purchasePrice !== "") {
        await db.purchasePrice.create({ data: { productId: id, price: parseFloat(String(purchasePrice)), isActive: true } });
      }
    }

    // P2-02 (inline): salePrice mutation via this route also emits sale_price.updated.
    // There is no dedicated /api/accounting/prices/sale route — salePrice lives here.
    // Both the SalePrice write and the outbox event are inside the same transaction.
    if (salePrice !== undefined) {
      await db.$transaction(async (tx) => {
        await tx.salePrice.updateMany({ where: { productId: id, isActive: true }, data: { isActive: false } });
        if (salePrice != null && salePrice !== "") {
          await tx.salePrice.create({ data: { productId: id, price: parseFloat(String(salePrice)), isActive: true } });
        }
        await createOutboxEvent(
          tx,
          { type: "sale_price.updated", occurredAt: new Date(), payload: { productId: id } },
          "SalePrice",
          id
        );
      });
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
    const session = await requirePermission("products:write");
    const { id } = await params;

    // R1-04: ownership check — returns 404 for cross-tenant or nonexistent product
    const owned = await db.product.findFirst({ where: { id, tenantId: session.tenantId } });
    if (!owned) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    await db.product.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAuthError(error);
  }
}
