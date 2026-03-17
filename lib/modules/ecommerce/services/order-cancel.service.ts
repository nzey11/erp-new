/**
 * Order Cancellation Service.
 *
 * Handles order cancellation for both customer and admin flows.
 */

import { db, toNumber } from "@/lib/shared/db";
import {
  cancelDocumentTransactional,
  type CancelledDocumentResult,
} from "@/lib/modules/accounting/services/document-confirm.service";

/**
 * Cancel order (if not yet shipped).
 * Customer-initiated cancellation.
 *
 * Uses cancelDocumentTransactional() to ensure:
 * - Reversing stock movements are created
 * - Counterparty balance is recalculated
 * - Payment status is updated to refunded if needed
 */
export async function cancelOrder(documentId: string, customerId: string): Promise<void> {
  const document = await db.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new Error("Order not found");
  }

  if (document.customerId !== customerId) {
    throw new Error("Access denied");
  }

  if (document.shippedAt || document.deliveredAt) {
    throw new Error("Cannot cancel shipped or delivered order");
  }

  if (document.status === "cancelled") {
    return; // Already cancelled — idempotent
  }

  // Update payment status to refunded if was paid (ecommerce-specific)
  if (document.paymentStatus === "paid") {
    await db.document.update({
      where: { id: documentId },
      data: { paymentStatus: "refunded" },
    });
  }

  // Proper cancel flow: reversing movements, balance recalc
  await cancelDocumentTransactional(documentId, null); // Customer-initiated, no actor
}

/**
 * Cancel ecommerce order with proper ERP flow.
 *
 * This function correctly uses cancelDocumentTransactional() to ensure:
 * - Reversing stock movements are created
 * - Counterparty balance is recalculated
 * - Payment status is updated to refunded if needed
 *
 * @param documentId - The sales_order document ID
 * @param actor - User performing the action (for audit)
 * @returns Cancelled document result
 */
export async function cancelEcommerceOrder(params: {
  documentId: string;
  actor: string | null;
}): Promise<CancelledDocumentResult> {
  const { documentId, actor } = params;

  const document = await db.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new Error("Документ не найден");
  }

  if (document.type !== "sales_order") {
    throw new Error("Документ не является заказом");
  }

  // Idempotency: already cancelled
  if (document.status === "cancelled") {
    return {
      ...document,
      totalAmount: toNumber(document.totalAmount),
      typeName: "Заказ",
      statusName: "Отменён",
      items: [],
      warehouse: null,
      targetWarehouse: null,
      counterparty: null,
    } as CancelledDocumentResult;
  }

  // Step 1: Update payment status to refunded if was paid (ecommerce-specific)
  if (document.paymentStatus === "paid") {
    await db.document.update({
      where: { id: documentId },
      data: { paymentStatus: "refunded" },
    });
  }

  // Step 2: Proper cancel flow (reversing movements, balance recalc)
  const result = await cancelDocumentTransactional(documentId, actor);

  return result;
}
