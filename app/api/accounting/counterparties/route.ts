import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, parseQuery, validationError } from "@/lib/shared/validation";
import {
  createCounterpartySchema,
  queryCounterpartiesSchema,
} from "@/lib/modules/accounting/schemas/counterparties.schema";
import { createCounterpartyWithParty } from "@/lib/modules/accounting/services/counterparty.service";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("counterparties:read");

    const query = parseQuery(request, queryCounterpartiesSchema);
    const { search, type, active, page = 1, limit = 50 } = query;

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { legalName: { contains: search } },
        { inn: { contains: search } },
        { phone: { contains: search } },
      ];
    }
    if (type) where.type = type;
    if (active !== undefined && active !== "") where.isActive = active === "true";

    const [counterparties, total] = await Promise.all([
      db.counterparty.findMany({
        where,
        include: {
          balance: { select: { balanceRub: true } },
        },
        orderBy: { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.counterparty.count({ where }),
    ]);

    return NextResponse.json({ data: counterparties, total, page, limit });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission("counterparties:write");

    const data = await parseBody(request, createCounterpartySchema);

    const { counterparty } = await createCounterpartyWithParty({
      tenantId: session.tenantId,
      type: data.type,
      name: data.name,
      legalName: data.legalName || null,
      inn: data.inn || null,
      kpp: data.kpp || null,
      bankAccount: data.bankAccount || null,
      bankName: data.bankName || null,
      bik: data.bik || null,
      address: data.address || null,
      phone: data.phone || null,
      email: data.email || null,
      contactPerson: data.contactPerson || null,
      notes: data.notes || null,
    });

    return NextResponse.json(counterparty, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}
