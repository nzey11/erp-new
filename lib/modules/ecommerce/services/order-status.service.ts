/**
 * Order Status Service.
 *
 * Handles order status updates (shipped, delivered) with state machine validation.
 */

import { db } from "@/lib/shared/db";
import { validateTransition } from "@/lib/modules/accounting/document-states";
import type { DocumentStatus } from "@/lib/generated/prisma/client";

/**
 * Update order status (admin: shipped / delivered).
 *
 * Uses state machine to validate the transition before updating.
 * Throws DocumentStateError if transition is not allowed.
 */
export async function updateOrderStatus(
  documentId: string,
  status: "shipped" | "delivered"
): Promise<void> {
  const document = await db.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new Error("Order not found");
  }

  if (document.type !== "sales_order") {
    throw new Error("Document is not a sales order");
  }

  // Validate transition through state machine
  validateTransition(document.type, document.status as DocumentStatus, status);

  const updateData: Record<string, unknown> = {};

  if (status === "shipped") {
    updateData.status = "shipped";
    updateData.shippedAt = new Date();
  } else if (status === "delivered") {
    updateData.status = "delivered";
    updateData.deliveredAt = new Date();
  }

  await db.document.update({
    where: { id: documentId },
    data: updateData,
  });
}
