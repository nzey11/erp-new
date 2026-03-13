import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { validationError } from "@/lib/shared/validation";
import { affectsStock, affectsBalance, getDocTypeName, getDocStatusName } from "@/lib/modules/accounting/documents";
import { createReversingMovements, hasReversingMovements } from "@/lib/modules/accounting/stock-movements";
import { recalculateBalance } from "@/lib/modules/accounting/balance";
import { logger } from "@/lib/shared/logger";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission("documents:confirm");
    const { id } = await params;

    const doc = await db.document.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!doc) {
      return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    }
    if (doc.status !== "confirmed") {
      return NextResponse.json(
        { error: "Только подтверждённые документы можно отменить" },
        { status: 400 }
      );
    }

    // Cancel the document
    const cancelled = await db.document.update({
      where: { id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
      },
      include: {
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        warehouse: { select: { id: true, name: true } },
        targetWarehouse: { select: { id: true, name: true } },
        counterparty: { select: { id: true, name: true } },
      },
    });

    // Create reversing stock movements (idempotent)
    if (affectsStock(doc.type)) {
      // Check idempotency: already has reversing movements?
      const alreadyReversed = await hasReversingMovements(id);
      
      if (!alreadyReversed) {
        const result = await createReversingMovements(id);
        logger.info("stock", "Created reversing movements", {
          documentId: id,
          documentType: doc.type,
          movementsCreated: result.created,
        });
      } else {
        logger.info("stock", "Reversing movements already exist, skipping", {
          documentId: id,
        });
      }
    }

    // Recalculate counterparty balance
    if (affectsBalance(doc.type) && doc.counterpartyId) {
      await recalculateBalance(doc.counterpartyId);
    }

    return NextResponse.json({
      ...cancelled,
      typeName: getDocTypeName(cancelled.type),
      statusName: getDocStatusName(cancelled.status),
    });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}
