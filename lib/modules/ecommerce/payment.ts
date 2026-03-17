/** T-Bank (T-Bank) payment integration. Placeholder for real integration. */

import crypto from "crypto";
import { db, toNumber } from "@/lib/shared/db";
import { confirmOrderPayment } from "@/lib/modules/ecommerce";

interface PaymentResult {
  order: {
    id: string;
    number: string;
    totalAmount: number;
    paymentStatus: string;
    paidAt: Date | null;
  } | null;
  message: string;
  externalId: string;
  status: "success" | "failed" | string;
}

/** Verify T-Bank webhook signature */
export function verifyTochkaSignature(payload: string, signature: string): boolean {
  const secret = process.env.TOCHKA_WEBHOOK_SECRET;
  if (!secret) return false;

  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

/** Process payment webhook */
export async function handlePaymentWebhook(externalId: string, status: "success" | "failed"): Promise<PaymentResult> {
  // Find document by payment external ID
  const document = await db.document.findFirst({
    where: { paymentExternalId: externalId },
  });

  if (!document) {
    throw new Error("Order not found for payment");
  }

  if (document.type !== "sales_order") {
    throw new Error("Document is not a sales order");
  }

  if (status === "success") {
    // Use new accounting module to confirm payment
    await confirmOrderPayment({
      documentId: document.id,
      paymentExternalId: externalId,
      paymentMethod: "tochka",
    });

    return {
      order: {
        ...document,
        totalAmount: toNumber(document.totalAmount),
      },
      message: "Платёж подтверждён",
      externalId,
      status: "success",
    };
  } else {
    // Payment failed
    await db.document.update({
      where: { id: document.id },
      data: {
        paymentStatus: "failed",
      },
    });

    return {
      order: {
        ...document,
        totalAmount: toNumber(document.totalAmount),
      },
      message: "Платёж не прошёл",
      externalId,
      status: "failed",
    };
  }
}

/** Get payment by external ID */
export async function getPaymentByExternalId(externalId: string) {
  const payment = await db.document.findFirst({
    where: { paymentExternalId: externalId },
  });

  return payment;
}
