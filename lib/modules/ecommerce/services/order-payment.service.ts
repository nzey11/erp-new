/**
 * Order Payment Service.
 *
 * Handles payment confirmation for e-commerce orders.
 *
 * Phase 4: Decoupled from accounting module.
 * Emits OrderPaymentConfirmed event instead of calling confirmDocumentTransactional directly.
 */

import { db, toNumber } from "@/lib/shared/db";
import { recordPaymentReceived } from "@/lib/domain/party";
import { createOutboxEvent, processOutboxEvents } from "@/lib/events/outbox";
import type { PaymentMethod } from "../types";
import type { ConfirmedDocumentResult } from "@/lib/modules/accounting/services/document-confirm.service";

/**
 * Confirm ecommerce order payment — canonical implementation.
 *
 * Handles payment confirmation for sales_order documents from any source:
 * - Webhook (paymentExternalId provided, actor = "system:webhook")
 * - Admin UI (actor = session username, paymentExternalId optional)
 *
 * Sequence (Phase 4 - decoupled from accounting):
 *   1. Validate document exists and is a sales_order
 *   2. Idempotency guard (already confirmed + paid → return early)
 *   3. Update payment metadata + emit OrderPaymentConfirmed event (atomic)
 *   4. Process outbox events → handler calls confirmDocumentTransactional
 *   5. Record party activity for CRM timeline
 *
 * @param params.documentId - The sales_order document ID
 * @param params.paymentMethod - Payment method
 * @param params.paymentExternalId - External payment ID (optional for admin-initiated)
 * @param params.actor - Audit actor (null for webhook, username for admin)
 * @returns Confirmed document result
 */
export async function confirmEcommerceOrderPayment(params: {
  documentId: string;
  paymentMethod: PaymentMethod;
  paymentExternalId?: string;
  actor?: string | null;
}): Promise<ConfirmedDocumentResult> {
  const { documentId, paymentMethod, paymentExternalId, actor = null } = params;

  const document = await db.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new Error("Документ не найден");
  }

  if (document.type !== "sales_order") {
    throw new Error("Документ не является заказом");
  }

  // Idempotency: already confirmed + paid → return early
  if (document.status === "confirmed" && document.paymentStatus === "paid") {
    return {
      ...document,
      totalAmount: toNumber(document.totalAmount),
      typeName: "Заказ",
      statusName: "Подтверждён",
      items: [],
      warehouse: null,
      targetWarehouse: null,
      counterparty: null,
    } as ConfirmedDocumentResult;
  }

  // Step 1: Update payment metadata and emit OrderPaymentConfirmed event
  const confirmedActor = actor ?? "system:webhook";
  const occurredAt = new Date();

  await db.$transaction(async (tx) => {
    // Update payment metadata
    await tx.document.update({
      where: { id: documentId },
      data: {
        paymentStatus: "paid",
        paidAt: occurredAt,
        paymentMethod,
        ...(paymentExternalId && { paymentExternalId }),
      },
    });

    // Emit OrderPaymentConfirmed event
    await createOutboxEvent(
      tx,
      {
        type: "OrderPaymentConfirmed",
        occurredAt,
        payload: {
          orderId: documentId, // Using documentId as orderId for sales_order
          tenantId: document.tenantId,
          documentId,
          customerId: document.customerId ?? "",
          amount: toNumber(document.totalAmount),
          paymentMethod,
          paymentExternalId,
          actor: confirmedActor,
        },
      },
      "Order",
      documentId
    );
  });

  // Step 2: Process outbox events immediately
  await processOutboxEvents(10);

  // Step 3: Fetch the confirmed document to return
  const confirmedDoc = await db.document.findUnique({
    where: { id: documentId },
  });

  if (!confirmedDoc) {
    throw new Error("Document not found after confirmation");
  }

  // Step 4: Record party activity for CRM timeline
  if (document.counterpartyId) {
    await recordPaymentReceived({
      counterpartyId: document.counterpartyId,
      paymentId: paymentExternalId || documentId,
      amount: toNumber(document.totalAmount),
      method: paymentMethod,
      occurredAt,
    });
  }

  return {
    ...confirmedDoc,
    totalAmount: toNumber(confirmedDoc.totalAmount),
    typeName: "Заказ",
    statusName: "Подтверждён",
    items: [],
    warehouse: null,
    targetWarehouse: null,
    counterparty: null,
  } as ConfirmedDocumentResult;
}

/**
 * @deprecated Use confirmEcommerceOrderPayment() instead.
 * Kept for backward compatibility with payment.ts webhook handler.
 * Will be removed when payment.ts is updated (roadmap P3-01/P3-02).
 */
export async function confirmOrderPayment(params: {
  documentId: string;
  paymentExternalId: string;
  paymentMethod: PaymentMethod;
}): Promise<void> {
  await confirmEcommerceOrderPayment({
    documentId: params.documentId,
    paymentMethod: params.paymentMethod,
    paymentExternalId: params.paymentExternalId,
    actor: "system:webhook",
  });
}
