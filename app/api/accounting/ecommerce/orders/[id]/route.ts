import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { updateOrderStatusSchema } from "@/lib/modules/accounting/schemas/ecommerce-admin.schema";
import { updateOrderStatus, confirmEcommerceOrderPayment, cancelEcommerceOrder } from "@/lib/modules/ecommerce";
import { validateTransition, DocumentStateError } from "@/lib/modules/accounting/document-states";
import type { DocumentStatus } from "@/lib/generated/prisma/client";
import { getAuthSession } from "@/lib/shared/auth";
import { confirmDocumentTransactional } from "@/lib/modules/accounting/services/document-confirm.service";
import { EcommerceAdminService } from "@/lib/modules/accounting";

/** PUT /api/accounting/ecommerce/orders/[id] — Update ecom order status */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("products:write");

    const { id } = await params;
    const data = await parseBody(request, updateOrderStatusSchema);

    // Load document to validate the transition before applying
    const doc = await EcommerceAdminService.findDocumentStatus(id);
    if (!doc) {
      return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    }

    // Map incoming status names to DocumentStatus values
    // "paid" is a payment event that triggers confirmed status
    const targetStatus = (data.status === "paid" ? "confirmed" : data.status) as DocumentStatus;

    try {
      validateTransition(doc.type, doc.status as DocumentStatus, targetStatus);
    } catch (e) {
      if (e instanceof DocumentStateError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }

    // Map old status names to Document operations
    if (data.status === "shipped" || data.status === "delivered") {
      await updateOrderStatus(id, data.status);
    } else if (data.status === "paid") {
      // Use proper confirm flow: stock movements, outbox, handlers
      const session = await getAuthSession();
      const result = await confirmEcommerceOrderPayment({
        documentId: id,
        paymentMethod: "tochka", // Default for admin-initiated
        actor: session?.username ?? null,
      });
      
      // Return the confirmed document with full relations
      const document = await EcommerceAdminService.findDocumentWithDetails(id);
      return NextResponse.json(document);
    } else if (data.status === "cancelled") {
      // Use proper cancel flow: reversing movements, balance recalc
      const session = await getAuthSession();
      await cancelEcommerceOrder({
        documentId: id,
        actor: session?.username ?? null,
      });
    } else if (data.status === "confirmed") {
      // Use proper confirm flow: stock movements, outbox, handlers
      const session = await getAuthSession();
      await confirmDocumentTransactional(id, session?.username ?? null);
    } else {
      return NextResponse.json(
        { error: `Unsupported status: ${data.status}` },
        { status: 400 }
      );
    }

    const document = await EcommerceAdminService.findDocumentWithDetails(id);
    return NextResponse.json(document);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}
