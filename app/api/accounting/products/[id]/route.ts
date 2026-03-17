import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { updateProductSchema } from "@/lib/modules/accounting/schemas/products.schema";
import { createOutboxEvent } from "@/lib/events/outbox";
import { ProductService } from "@/lib/modules/accounting";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission("products:read");
    const { id } = await params;

    const product = await ProductService.findById(id, session.tenantId);

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
    const data = await parseBody(request, updateProductSchema);
    const {
      name, sku, barcode, description, unitId, categoryId, imageUrl, isActive,
      purchasePrice, salePrice,
      seoTitle, seoDescription, seoKeywords, slug,
      publishedToStore,
    } = data;

    // Tenant gate: ensure product belongs to the authenticated tenant
    const existing = await ProductService.getTenantGate(id, session.tenantId);
    if (!existing) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    // P2-01: product.update + outbox event are atomic — both inside one transaction.
    // purchasePrice and salePrice updates remain outside (their own events: P2-02).
    const product = await ProductService.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name;
      if (sku !== undefined) updateData.sku = sku || null;
      if (barcode !== undefined) updateData.barcode = barcode || null;
      if (description !== undefined) updateData.description = description;
      if (unitId !== undefined) updateData.unitId = unitId;
      if (categoryId !== undefined) updateData.categoryId = categoryId || null;
      if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (seoTitle !== undefined) updateData.seoTitle = seoTitle || null;
      if (seoDescription !== undefined) updateData.seoDescription = seoDescription || null;
      if (seoKeywords !== undefined) updateData.seoKeywords = seoKeywords || null;
      if (slug !== undefined) updateData.slug = slug || null;
      if (publishedToStore !== undefined) updateData.publishedToStore = !!publishedToStore;

      const updated = await ProductService.update(id, updateData, tx);

      await createOutboxEvent(
        tx,
        { type: "product.updated", occurredAt: new Date(), payload: { productId: id } },
        "Product",
        id
      );

      return updated;
    });

    // Update purchase price if provided
    if (purchasePrice !== undefined) {
      await ProductService.updatePurchasePrice(id, purchasePrice);
    }

    // P2-02 (inline): salePrice mutation via this route also emits sale_price.updated.
    if (salePrice !== undefined) {
      await ProductService.$transaction(async (tx) => {
        await ProductService.updateSalePrice(id, salePrice, tx);
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

    // Tenant gate: ensure product belongs to the authenticated tenant
    const existing = await ProductService.getTenantGate(id, session.tenantId);
    if (!existing) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    // P-delete: soft-delete + outbox event are atomic.
    await ProductService.$transaction(async (tx) => {
      await ProductService.softDelete(id, tx);

      await createOutboxEvent(
        tx,
        { type: "product.updated", occurredAt: new Date(), payload: { productId: id } },
        "Product",
        id
      );
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAuthError(error);
  }
}
