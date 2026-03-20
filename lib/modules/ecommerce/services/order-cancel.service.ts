/**
 * Order Cancellation Service.
 *
 * Handles order cancellation for both customer and admin flows.
 *
 * Phase 4: Decoupled from accounting module.
 * Emits OrderCancelled event instead of calling cancelDocumentTransactional directly.
 */

import { db, toNumber } from "@/lib/shared/db";
import { createOutboxEvent, processOutboxEvents } from "@/lib/events/outbox";
import type { CancelledDocumentResult } from "@/lib/modules/accounting/services/document-confirm.service";

/**
 * Cancel order (if not yet shipped).
 * Customer-initiated cancellation.
 *
 * Phase 4: Emits OrderCancelled event for processing by accounting handlers.
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

  const occurredAt = new Date();

  // Update payment status and emit OrderCancelled event
  await db.$transaction(async (tx) => {
    // Update payment status to refunded if was paid (ecommerce-specific)
    if (document.paymentStatus === "paid") {
      await tx.document.update({
        where: { id: documentId },
        data: { paymentStatus: "refunded" },
      });
    }

    // Emit OrderCancelled event
    await createOutboxEvent(
      tx,
      {
        type: "OrderCancelled",
        occurredAt,
        payload: {
          orderId: documentId,
          tenantId: document.tenantId,
          documentId,
          customerId: document.customerId ?? "",
          actor: null, // Customer-initiated
        },
      },
      "Order",
      documentId
    );
  });

  // Process outbox events immediately
  await processOutboxEvents(10);
}

/**
 * Cancel ecommerce order with proper ERP flow.
 *
 * Phase 4: Emits OrderCancelled event for processing by accounting handlers.
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

  const occurredAt = new Date();

  // Step 1: Update payment status and emit OrderCancelled event
  await db.$transaction(async (tx) => {
    // Update payment status to refunded if was paid (ecommerce-specific)
    if (document.paymentStatus === "paid") {
      await tx.document.update({
        where: { id: documentId },
        data: { paymentStatus: "refunded" },
      });
    }

    // Emit OrderCancelled event
    await createOutboxEvent(
      tx,
      {
        type: "OrderCancelled",
        occurredAt,
        payload: {
          orderId: documentId,
          tenantId: document.tenantId,
          documentId,
          customerId: document.customerId ?? "",
          actor,
        },
      },
      "Order",
      documentId
    );
  });

  // Step 2: Process outbox events immediately
  await processOutboxEvents(10);

  // Step 3: Fetch the cancelled document to return
  const cancelledDoc = await db.document.findUnique({
    where: { id: documentId },
  });

  if (!cancelledDoc) {
    throw new Error("Document not found after cancellation");
  }

  return {
    ...cancelledDoc,
    totalAmount: toNumber(cancelledDoc.totalAmount),
    typeName: "Заказ",
    statusName: "Отменён",
    items: [],
    warehouse: null,
    targetWarehouse: null,
    counterparty: null,
  } as CancelledDocumentResult;
}
