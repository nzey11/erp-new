import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requireAuth } from "@/lib/shared/authorization";
import { reverseEntry } from "@/lib/modules/accounting/finance/journal";
import { z } from "zod";

const updatePaymentSchema = z.object({
  categoryId: z.string().min(1).optional(),
  counterpartyId: z.string().optional().nullable(),
  amount: z.number().positive().optional(),
  paymentMethod: z.enum(["cash", "bank_transfer", "card"]).optional(),
  date: z.string().optional(),
  description: z.string().optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const data = updatePaymentSchema.parse(body);

    const existing = await db.payment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await db.payment.update({
      where: { id },
      data: {
        ...data,
        ...(data.date ? { date: new Date(data.date) } : {}),
      },
      include: {
        category: { select: { id: true, name: true, type: true } },
        counterparty: { select: { id: true, name: true } },
        document: { select: { id: true, number: true, type: true } },
      },
    });

    // Reverse the old journal entry and re-post with updated data
    try {
      const oldEntry = await db.journalEntry.findFirst({
        where: { sourceId: id, sourceType: "finance_payment", isReversed: false },
      });
      if (oldEntry) {
        await reverseEntry(oldEntry.id, { bypassAutoCheck: true });
      }
      // Re-post: build new journal entry directly (bypass idempotency check)
      const cashAccountCode = updated.paymentMethod === "cash" ? "50" : "51";
      const catData = updated.category as unknown as { defaultAccountCode?: string | null };
      const categoryAccountCode = catData.defaultAccountCode ?? (updated.type === "income" ? "91.1" : "91.2");
      const [cashAccount, categoryAccount] = await Promise.all([
        db.account.findUnique({ where: { code: cashAccountCode } }),
        db.account.findUnique({ where: { code: categoryAccountCode } }),
      ]);
      if (cashAccount && categoryAccount) {
        const counter = await db.journalCounter.upsert({
          where: { prefix: "JE" },
          update: { lastNumber: { increment: 1 } },
          create: { prefix: "JE", lastNumber: 1 },
        });
        const jeNumber = `JE-${String(counter.lastNumber).padStart(6, "0")}`;
        const debitAccountId  = updated.type === "income" ? cashAccount.id : categoryAccount.id;
        const creditAccountId = updated.type === "income" ? categoryAccount.id : cashAccount.id;
        const description = updated.description
          ? `${updated.category.name}: ${updated.description}`
          : updated.category.name;
        await db.journalEntry.create({
          data: {
            number: jeNumber,
            date: updated.date,
            description,
            sourceType: "finance_payment",
            sourceId: id,
            sourceNumber: updated.number,
            isManual: false,
            createdBy: null,
            lines: {
              create: [
                { accountId: debitAccountId,  debit: updated.amount, credit: 0, counterpartyId: updated.counterpartyId ?? null, currency: "RUB", amountRub: updated.amount },
                { accountId: creditAccountId, debit: 0, credit: updated.amount, counterpartyId: updated.counterpartyId ?? null, currency: "RUB", amountRub: updated.amount },
              ],
            },
          },
        });
      }
    } catch { /* journal update is non-critical */ }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;

    const existing = await db.payment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Reverse journal entry before deleting the payment
    try {
      const entry = await db.journalEntry.findFirst({
        where: { sourceId: id, sourceType: "finance_payment", isReversed: false },
      });
      if (entry) await reverseEntry(entry.id, { bypassAutoCheck: true });
    } catch { /* non-critical */ }

    await db.payment.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
