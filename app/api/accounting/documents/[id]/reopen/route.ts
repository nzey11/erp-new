import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { validationError } from "@/lib/shared/validation";
import { getAuthSession } from "@/lib/shared/auth";
import { db } from "@/lib/shared/db";
import { DocumentService } from "@/lib/modules/accounting";
import { reconcileStockRecord } from "@/lib/modules/accounting/inventory/stock-movements";
import { reverseEntryWithTx } from "@/lib/modules/accounting/finance/journal";
import { affectsStock } from "@/lib/modules/accounting/inventory/predicates";

/**
 * POST /api/accounting/documents/[id]/reopen
 *
 * Reopens a confirmed stock document for editing.
 * Applicable types: inventory_count, write_off, stock_receipt.
 *
 * Steps:
 *  1. Validate document exists, belongs to tenant, and is confirmed
 *  2. Validate document type is reopenable
 *  3. Create reversing stock movements (same logic as cancel)
 *  4. Reverse journal entries (same logic as cancel)
 *  5. Set status → draft (NOT cancelled — document stays editable)
 *
 * After editing, user must re-confirm the document.
 */

type Params = { params: Promise<{ id: string }> };

const REOPENABLE_TYPES = ["inventory_count", "write_off", "stock_receipt"] as const;

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission("documents:confirm");
    const { id } = await params;
    const authSession = await getAuthSession();
    const actor = authSession?.username ?? null;

    // Tenant gate: ensure document belongs to the authenticated tenant
    const docGate = await DocumentService.getTenantGate(id, session.tenantId);
    if (!docGate) {
      return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    }

    // Load full document with items
    const doc = await db.document.findUnique({
      where: { id, tenantId: session.tenantId },
      include: { items: true },
    });

    if (!doc) {
      return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    }

    if (doc.status !== "confirmed") {
      return NextResponse.json(
        { error: "Можно открыть для редактирования только подтверждённый документ" },
        { status: 400 }
      );
    }

    if (!REOPENABLE_TYPES.includes(doc.type as typeof REOPENABLE_TYPES[number])) {
      return NextResponse.json(
        { error: `Тип документа «${doc.type}» нельзя открыть для редактирования` },
        { status: 400 }
      );
    }

    // Atomic transaction: set status to draft + create reversing stock movements + reverse journal entries
    await db.$transaction(async (tx) => {
      // 1. Set status back to draft
      await tx.document.update({
        where: { id },
        data: {
          status: "draft",
          confirmedAt: null,
          confirmedBy: null,
        },
      });

      // 2. Create reversing stock movements (idempotent — skip if already reversed)
      if (affectsStock(doc.type)) {
        const alreadyReversed =
          (await tx.stockMovement.count({
            where: { reversesDocumentId: id },
          })) > 0;

        if (!alreadyReversed) {
          const originalMovements = await tx.stockMovement.findMany({
            where: { documentId: id, isReversing: false },
          });

          if (originalMovements.length > 0) {
            await tx.stockMovement.createMany({
              data: originalMovements.map((m) => ({
                documentId: id,
                productId: m.productId,
                warehouseId: m.warehouseId,
                variantId: m.variantId,
                quantity: -m.quantity,
                cost: m.cost,
                totalCost: -m.totalCost,
                type: m.type,
                isReversing: true,
                reversesDocumentId: id,
              })),
            });
          }
        }
      }

      // 3. Reverse all journal entries for this document
      const journalEntries = await tx.journalEntry.findMany({
        where: { sourceId: id, isReversed: false },
        select: { id: true, number: true },
      });

      const reopenDate = new Date();
      for (const entry of journalEntries) {
        await reverseEntryWithTx(tx, entry.id, {
          date: reopenDate,
          description: `Открытие документа ${doc.number} для редактирования — сторно проводки ${entry.number}`,
          createdBy: actor ?? undefined,
        });
      }
    });

    // 4. Reconcile StockRecord projections (brings quantity back from summed movements)
    if (affectsStock(doc.type) && doc.warehouseId) {
      const affectedKeys = new Set<string>();
      for (const item of doc.items) {
        affectedKeys.add(`${item.productId}:${doc.warehouseId}`);
      }
      for (const key of affectedKeys) {
        const [productId, warehouseId] = key.split(":");
        await reconcileStockRecord(productId, warehouseId);
      }
    }

    return NextResponse.json({ success: true, status: "draft" });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}
