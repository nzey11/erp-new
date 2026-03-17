"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/shared/db";
import { requirePermission } from "@/lib/shared/authorization";
import type { CounterpartyFormValues } from "./_components/counterparty-drawer";

/**
 * Create a new counterparty.
 */
export async function createCounterparty(values: CounterpartyFormValues) {
  const session = await requirePermission("counterparties:write");

  const counterparty = await db.counterparty.create({
    data: {
      name: values.name,
      legalName: values.legalName || null,
      type: values.type,
      inn: values.inn || null,
      phone: values.phone || null,
      email: values.email || null,
      contactPerson: values.contactPerson || null,
      isActive: values.isActive,
      tenantId: session.tenantId,
    },
  });

  // Create initial balance record
  await db.counterpartyBalance.create({
    data: {
      counterpartyId: counterparty.id,
      balanceRub: 0,
    },
  });

  revalidatePath("/accounting/counterparties");

  return { success: true, counterparty };
}

/**
 * Update an existing counterparty.
 */
export async function updateCounterparty(
  counterpartyId: string,
  values: CounterpartyFormValues
) {
  const session = await requirePermission("counterparties:write");

  // Verify counterparty belongs to tenant
  const existing = await db.counterparty.findFirst({
    where: { id: counterpartyId, tenantId: session.tenantId },
  });

  if (!existing) {
    throw new Error("Counterparty not found");
  }

  const counterparty = await db.counterparty.update({
    where: { id: counterpartyId },
    data: {
      name: values.name,
      legalName: values.legalName || null,
      type: values.type,
      inn: values.inn || null,
      phone: values.phone || null,
      email: values.email || null,
      contactPerson: values.contactPerson || null,
      isActive: values.isActive,
    },
  });

  revalidatePath("/accounting/counterparties");

  return { success: true, counterparty };
}

/**
 * Delete a counterparty.
 */
export async function deleteCounterparty(counterpartyId: string) {
  const session = await requirePermission("counterparties:write");

  // Verify counterparty belongs to tenant
  const existing = await db.counterparty.findFirst({
    where: { id: counterpartyId, tenantId: session.tenantId },
  });

  if (!existing) {
    throw new Error("Counterparty not found");
  }

  // Check if counterparty has related documents or payments
  const [documentsCount, paymentsCount] = await Promise.all([
    db.document.count({
      where: { counterpartyId },
    }),
    db.payment.count({
      where: { counterpartyId },
    }),
  ]);

  if (documentsCount > 0 || paymentsCount > 0) {
    throw new Error(
      "Cannot delete counterparty with related documents or payments"
    );
  }

  await db.counterparty.delete({
    where: { id: counterpartyId },
  });

  revalidatePath("/accounting/counterparties");

  return { success: true };
}
