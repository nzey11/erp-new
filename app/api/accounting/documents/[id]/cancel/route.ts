import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { validationError } from "@/lib/shared/validation";
import { affectsStock } from "@/lib/modules/accounting/inventory/predicates";
import { affectsBalance } from "@/lib/modules/accounting/finance/predicates";
import { getDocTypeName, getDocStatusName } from "@/lib/modules/accounting/documents";
import { createReversingMovements, hasReversingMovements } from "@/lib/modules/accounting/inventory/stock-movements";
import { recalculateBalance } from "@/lib/modules/finance/reports";
import { logger } from "@/lib/shared/logger";
import { validateTransition, DocumentStateError } from "@/lib/modules/accounting/document-states";
import type { DocumentStatus } from "@/lib/generated/prisma/client";

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

    try {
      validateTransition(doc.type, doc.status as DocumentStatus, "cancelled");
    } catch (e) {
      if (e instanceof DocumentStateError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
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
