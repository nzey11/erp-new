/**
 * Order Payment Service.
 *
 * Handles payment confirmation for e-commerce orders.
 */

import { db, toNumber } from "@/lib/shared/db";
import { recordPaymentReceived } from "@/lib/domain/party";
import {
  confirmDocumentTransactional,
  type ConfirmedDocumentResult,
} from "@/lib/modules/accounting/services/document-confirm.service";
import type { PaymentMethod } from "../types";

/**
 * Confirm ecommerce order payment — canonical implementation.
 *
 * Handles payment confirmation for sales_order documents from any source:
 * - Webhook (paymentExternalId provided, actor = "system:webhook")
 * - Admin UI (actor = session username, paymentExternalId optional)
 *
 * Sequence:
 *   1. Validate document exists and is a sales_order
 *   2. Idempotency guard (already confirmed + paid → return early)
 *   3. Update payment metadata (paymentStatus, paymentMethod, paidAt, paymentExternalId)
 *   4. Delegate to confirmDocumentTransactional() → stock + outbox + handlers
 *   5. Record party activity for CRM timeline
 *
 * Known limitation (roadmap P1-05 TODO):
 *   Steps 3 and 4 are separate DB operations (not atomic). If step 4 fails,
 *   paymentStatus=paid is already committed — webhook retry is safe due to
 *   idempotency guard. Full atomicity requires merging paymentMetadata into
 *   confirmDocumentTransactional().
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

  // Step 1: Update payment metadata
  await db.document.update({
    where: { id: documentId },
    data: {
      paymentStatus: "paid",
      paidAt: new Date(),
      paymentMethod,
      ...(paymentExternalId && { paymentExternalId }),
    },
  });

  // Step 2: Proper confirm flow (stock movements, outbox, handlers)
  const confirmedActor = actor ?? "system:webhook";
  const result = await confirmDocumentTransactional(documentId, confirmedActor);

  // Step 3: Record party activity for CRM timeline
  if (document.counterpartyId) {
    await recordPaymentReceived({
      counterpartyId: document.counterpartyId,
      paymentId: paymentExternalId || documentId,
      amount: toNumber(document.totalAmount),
      method: paymentMethod,
      occurredAt: new Date(),
    });
  }

  return result;
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
