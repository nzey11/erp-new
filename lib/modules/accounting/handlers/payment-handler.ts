/**
 * Accounting handler — Payment
 *
 * Reacts to DocumentConfirmed by auto-creating a Finance Payment record
 * ONLY for explicit payment-type documents (incoming_payment, outgoing_payment).
 *
 * Shipments (incoming_shipment, outgoing_shipment) create a debt, NOT a payment.
 * Finance Payment for shipments must be created manually by the accountant.
 *
 * Logic moved from DocumentConfirmService.autoCreatePaymentForShipment()
 * as part of Phase 1.5 domain event decoupling.
 */

import type { DocumentConfirmedEvent } from "@/lib/events";
import { db } from "@/lib/shared/db";
import type { PaymentType } from "@/lib/generated/prisma/client";

export async function onDocumentConfirmedPayment(
  event: DocumentConfirmedEvent
): Promise<void> {
  const { documentType, documentId, documentNumber, counterpartyId, totalAmount, tenantId } =
    event.payload;

  // Only auto-create Finance Payment for explicit payment documents.
  // Shipments create AR/AP debt (счет 60/62), not a cash payment.
  if (documentType !== "incoming_payment" && documentType !== "outgoing_payment") {
    return;
  }

  // incoming_payment = money arrives in the company (from customer) → income
  // outgoing_payment  = money leaves the company (to supplier)   → expense
  const isPurchase = documentType === "outgoing_payment";
  const paymentType = isPurchase ? "expense" : "income";
  const categoryName = isPurchase ? "Оплата поставщику" : "Оплата от покупателя";

  const category = await db.financeCategory.findFirst({
    where: { name: categoryName, type: paymentType, isActive: true },
  });

  if (!category || totalAmount <= 0) return;

  // Idempotency: don't create a second payment if one already exists for this document
  const existing = await db.payment.findFirst({
    where: { documentId },
  });
  if (existing) return;

  const counter = await db.paymentCounter.update({
    where: { prefix: "PAY" },
    data: { lastNumber: { increment: 1 } },
  });
  const paymentNumber = `${counter.prefix}-${String(counter.lastNumber).padStart(6, "0")}`;

  // Fetch paymentType from the document (needed for paymentMethod field)
  const doc = await db.document.findUnique({
    where: { id: documentId },
    select: { paymentType: true },
  });

  await db.payment.create({
    data: {
      number: paymentNumber,
      type: paymentType,
      categoryId: category.id,
      counterpartyId: counterpartyId ?? null,
      documentId,
      amount: totalAmount,
      paymentMethod: (doc?.paymentType ?? "bank_transfer") as PaymentType,
      date: new Date(),
      description: `Авто: по документу ${documentNumber}`,
      tenantId,
    },
  });
}
