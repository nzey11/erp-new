import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/shared/authorization";
import { z } from "zod";
import { autoPostPayment } from "@/lib/modules/accounting/finance/journal";
import { handleAuthError } from "@/lib/shared/authorization";
import { PaymentService } from "@/lib/modules/finance";

const createPaymentSchema = z.object({
  type: z.enum(["income", "expense"]),
  categoryId: z.string().min(1),
  counterpartyId: z.string().optional().nullable(),
  documentId: z.string().optional().nullable(),
  amount: z.number().positive(),
  paymentMethod: z.enum(["cash", "bank_transfer", "card"]),
  date: z.string().optional(),
  description: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission("payments:read");
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const categoryId = searchParams.get("categoryId");
    const counterpartyId = searchParams.get("counterpartyId");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const page = parseInt(searchParams.get("page") ?? "1");
    const limit = parseInt(searchParams.get("limit") ?? "50");

    const result = await PaymentService.listPayments(
      { type, categoryId, counterpartyId, dateFrom, dateTo, page, limit },
      session.tenantId
    );

    return NextResponse.json(result);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission("payments:write");
    const body = await request.json();
    const data = createPaymentSchema.parse(body);

    const payment = await PaymentService.createPayment(data, session.tenantId);

    // Auto-post to journal (non-critical)
    try { await autoPostPayment(payment.id); } catch { /* silent */ }

    return NextResponse.json(payment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: error.flatten() }, { status: 400 });
    }
    return handleAuthError(error);
  }
}
