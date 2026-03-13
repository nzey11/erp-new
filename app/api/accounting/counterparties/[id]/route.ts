import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { getBalance } from "@/lib/modules/finance/reports";
import { parseBody, validationError } from "@/lib/shared/validation";
import { updateCounterpartySchema } from "@/lib/modules/accounting/schemas/counterparties.schema";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission("counterparties:read");
    const { id } = await params;

    const counterparty = await db.counterparty.findUnique({
      where: { id },
      include: {
        balance: true,
        interactions: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });

    if (!counterparty) {
      return NextResponse.json({ error: "Контрагент не найден" }, { status: 404 });
    }

    const balance = await getBalance(id);

    return NextResponse.json({ ...counterparty, calculatedBalance: balance });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("counterparties:write");
    const { id } = await params;
    const data = await parseBody(request, updateCounterpartySchema);

    const updateData: Record<string, unknown> = {};
    if (data.type !== undefined) updateData.type = data.type;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.legalName !== undefined) updateData.legalName = data.legalName;
    if (data.inn !== undefined) updateData.inn = data.inn;
    if (data.kpp !== undefined) updateData.kpp = data.kpp;
    if (data.bankAccount !== undefined) updateData.bankAccount = data.bankAccount;
    if (data.bankName !== undefined) updateData.bankName = data.bankName;
    if (data.bik !== undefined) updateData.bik = data.bik;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.contactPerson !== undefined) updateData.contactPerson = data.contactPerson;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const counterparty = await db.counterparty.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(counterparty);
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission("counterparties:write");
    const { id } = await params;

    await db.counterparty.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}
