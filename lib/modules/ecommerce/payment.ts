/** Точка Банк (T-Bank) payment integration. Placeholder for real integration. */

import crypto from "crypto";
import { db } from "@/lib/shared/db";

interface PaymentLinkResult {
  paymentUrl: string;
  externalId: string;
}

/** Create a payment link via Точка Банк acquiring API */
export async function createPaymentLink(
  orderId: string,
  orderNumber: string,
  amount: number,
  returnUrl: string
): Promise<PaymentLinkResult> {
  // TODO: Replace with real Точка Банк API integration
  // const customerCode = process.env.TOCHKA_CUSTOMER_CODE;
  // const merchantId = process.env.TOCHKA_MERCHANT_ID;
  // const accessToken = process.env.TOCHKA_ACCESS_TOKEN;

  // For now, return a stub
  const externalId = `tochka_${orderId}_${Date.now()}`;

  return {
    paymentUrl: `${returnUrl}?payment=success&orderId=${orderId}`,
    externalId,
  };
}

/** Verify Точка Банк webhook signature */
export function verifyWebhookSignature(payload: string, signature: string): boolean {
  const secret = process.env.TOCHKA_WEBHOOK_SECRET;
  if (!secret) return false;

  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

/** Process payment webhook */
export async function handlePaymentWebhook(externalId: string, status: "success" | "failed") {
  const order = await db.order.findFirst({
    where: { paymentExternalId: externalId },
  });

  if (!order) throw new Error("Order not found for payment");

  if (status === "success") {
    const { confirmOrderPayment } = await import("./orders");
    await confirmOrderPayment(order.id, externalId);
  } else {
    await db.order.update({
      where: { id: order.id },
      data: { paymentStatus: "failed" },
    });
  }
}
