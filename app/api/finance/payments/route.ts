import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requireAuth } from "@/lib/shared/authorization";
import { z } from "zod";
import { autoPostPayment } from "@/lib/modules/accounting/finance/journal";

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

async function getNextPaymentNumber(): Promise<string> {
  const counter = await db.paymentCounter.update({
    where: { prefix: "PAY" },
    data: { lastNumber: { increment: 1 } },
  });
  return `${counter.prefix}-${String(counter.lastNumber).padStart(6, "0")}`;
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const categoryId = searchParams.get("categoryId");
    const counterpartyId = searchParams.get("counterpartyId");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const page = parseInt(searchParams.get("page") ?? "1");
    const limit = parseInt(searchParams.get("limit") ?? "50");

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (categoryId) where.categoryId = categoryId;
    if (counterpartyId) where.counterpartyId = counterpartyId;
    if (dateFrom || dateTo) {
      where.date = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo + "T23:59:59") } : {}),
      };
    }

    const [payments, total, incomeAgg, expenseAgg] = await Promise.all([
      db.payment.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, type: true } },
          counterparty: { select: { id: true, name: true } },
          document: { select: { id: true, number: true, type: true } },
        },
        orderBy: { date: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.payment.count({ where }),
      db.payment.aggregate({ _sum: { amount: true }, where: { ...where, type: "income" } }),
      db.payment.aggregate({ _sum: { amount: true }, where: { ...where, type: "expense" } }),
    ]);

    const incomeTotal = incomeAgg._sum.amount ?? 0;
    const expenseTotal = expenseAgg._sum.amount ?? 0;

    return NextResponse.json({ payments, total, page, limit, incomeTotal, expenseTotal, netCashFlow: incomeTotal - expenseTotal });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = await request.json();
    const data = createPaymentSchema.parse(body);

    const number = await getNextPaymentNumber();

    const payment = await db.payment.create({
      data: {
        number,
        type: data.type,
        categoryId: data.categoryId,
        counterpartyId: data.counterpartyId ?? null,
        documentId: data.documentId ?? null,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        date: data.date ? new Date(data.date) : new Date(),
        description: data.description ?? null,
      },
      include: {
        category: { select: { id: true, name: true, type: true } },
        counterparty: { select: { id: true, name: true } },
        document: { select: { id: true, number: true, type: true } },
      },
    });

    // Auto-post to journal (non-critical)
    try { await autoPostPayment(payment.id); } catch { /* silent */ }

    return NextResponse.json(payment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
