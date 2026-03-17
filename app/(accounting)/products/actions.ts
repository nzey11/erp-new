"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/shared/db";
import { requirePermission } from "@/lib/shared/authorization";

/**
 * Archive a product (set isActive = false).
 */
export async function archiveProduct(productId: string) {
  const session = await requirePermission("products:write");

  const existing = await db.product.findFirst({
    where: { id: productId, tenantId: session.tenantId },
  });
  if (!existing) throw new Error("Product not found");

  await db.product.update({
    where: { id: productId },
    data: { isActive: false },
  });

  revalidatePath("/accounting/products");
  return { success: true };
}

/**
 * Restore a product (set isActive = true).
 */
export async function restoreProduct(productId: string) {
  const session = await requirePermission("products:write");

  const existing = await db.product.findFirst({
    where: { id: productId, tenantId: session.tenantId },
  });
  if (!existing) throw new Error("Product not found");

  await db.product.update({
    where: { id: productId },
    data: { isActive: true },
  });

  revalidatePath("/accounting/products");
  return { success: true };
}

/**
 * Duplicate a product (shallow copy — no variants, no images).
 */
export async function duplicateProduct(productId: string) {
  const session = await requirePermission("products:write");

  const source = await db.product.findFirst({
    where: { id: productId, tenantId: session.tenantId },
    include: {
      salePrices: {
        where: { isActive: true, priceListId: null },
        orderBy: { validFrom: "desc" },
        take: 1,
      },
      purchasePrices: {
        where: { isActive: true },
        orderBy: { validFrom: "desc" },
        take: 1,
      },
    },
  });

  if (!source) throw new Error("Product not found");

  // Generate unique SKU for copy
  const copySku = source.sku ? `${source.sku}-COPY` : null;

  const copy = await db.product.create({
    data: {
      name: `${source.name} (копия)`,
      sku: copySku,
      description: source.description,
      unitId: source.unitId,
      categoryId: source.categoryId,
      isActive: false, // Copies start as inactive
      publishedToStore: false,
      tenantId: source.tenantId,
    },
  });

  revalidatePath("/accounting/products");
  return { success: true, productId: copy.id };
}

/**
 * Bulk archive products.
 */
export async function bulkArchiveProducts(productIds: string[]) {
  const session = await requirePermission("products:write");

  await db.product.updateMany({
    where: {
      id: { in: productIds },
      tenantId: session.tenantId,
    },
    data: { isActive: false },
  });

  revalidatePath("/accounting/products");
  return { success: true, count: productIds.length };
}

/**
 * Bulk restore products.
 */
export async function bulkRestoreProducts(productIds: string[]) {
  const session = await requirePermission("products:write");

  await db.product.updateMany({
    where: {
      id: { in: productIds },
      tenantId: session.tenantId,
    },
    data: { isActive: true },
  });

  revalidatePath("/accounting/products");
  return { success: true, count: productIds.length };
}

/**
 * Bulk delete products (permanent).
 * Only archives with no stock movements can be deleted.
 */
export async function bulkDeleteProducts(productIds: string[]) {
  const session = await requirePermission("products:write");

  // Verify all belong to tenant and have no stock movements
  const products = await db.product.findMany({
    where: { id: { in: productIds }, tenantId: session.tenantId },
    include: { _count: { select: { stockMovements: true, documentItems: true } } },
  });

  const withMovements = products.filter(
    (p) => p._count.stockMovements > 0 || p._count.documentItems > 0
  );

  if (withMovements.length > 0) {
    throw new Error(
      `Cannot delete ${withMovements.length} product(s) with stock movements or document items`
    );
  }

  await db.product.deleteMany({
    where: {
      id: { in: productIds },
      tenantId: session.tenantId,
    },
  });

  revalidatePath("/accounting/products");
  return { success: true, count: productIds.length };
}
