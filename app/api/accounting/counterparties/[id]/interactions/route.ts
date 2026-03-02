import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { createInteractionSchema } from "@/lib/modules/accounting/schemas/counterparties.schema";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission("counterparties:read");
    const { id } = await params;

    const interactions = await db.counterpartyInteraction.findMany({
      where: { counterpartyId: id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(interactions);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("counterparties:write");
    const { id } = await params;
    const data = await parseBody(request, createInteractionSchema);

    const interaction = await db.counterpartyInteraction.create({
      data: {
        counterpartyId: id,
        type: data.type,
        subject: data.subject || null,
        description: data.description || null,
      },
    });

    return NextResponse.json(interaction, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}
