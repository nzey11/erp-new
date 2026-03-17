"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/shared/db";
import { requirePermission } from "@/lib/shared/authorization";
import type { PaymentFormValues } from "./_components/payment-drawer";

/**
 * Create a new payment.
 */
export async function createPayment(values: PaymentFormValues) {
  const session = await requirePermission("payments:write");

  // Get next payment number
  const counter = await db.paymentCounter.update({
    where: { prefix: "PAY" },
    data: { lastNumber: { increment: 1 } },
  });
  const number = `${counter.prefix}-${String(counter.lastNumber).padStart(6, "0")}`;

  const payment = await db.payment.create({
    data: {
      number,
      type: values.type,
      categoryId: values.categoryId,
      counterpartyId: values.counterpartyId || null,
      amount: values.amount,
      paymentMethod: values.paymentMethod,
      date: new Date(values.date),
      description: values.description || null,
      tenantId: session.tenantId,
    },
  });

  revalidatePath("/finance/payments");

  return { success: true, payment };
}

/**
 * Update an existing payment.
 */
export async function updatePayment(paymentId: string, values: PaymentFormValues) {
  const session = await requirePermission("payments:write");

  // Verify payment belongs to tenant
  const existing = await db.payment.findFirst({
    where: { id: paymentId, tenantId: session.tenantId },
  });

  if (!existing) {
    throw new Error("Payment not found");
  }

  const payment = await db.payment.update({
    where: { id: paymentId },
    data: {
      type: values.type,
      categoryId: values.categoryId,
      counterpartyId: values.counterpartyId || null,
      amount: values.amount,
      paymentMethod: values.paymentMethod,
      date: new Date(values.date),
      description: values.description || null,
    },
  });

  revalidatePath("/finance/payments");

  return { success: true, payment };
}

/**
 * Delete a payment.
 */
export async function deletePayment(paymentId: string) {
  const session = await requirePermission("payments:write");

  // Verify payment belongs to tenant
  const existing = await db.payment.findFirst({
    where: { id: paymentId, tenantId: session.tenantId },
  });

  if (!existing) {
    throw new Error("Payment not found");
  }

  await db.payment.delete({
    where: { id: paymentId },
  });

  revalidatePath("/finance/payments");

  return { success: true };
}
