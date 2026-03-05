import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { getAuthSession } from "@/lib/shared/auth";
import {
  affectsStock, affectsBalance, isStockDecrease, isStockIncrease,
} from "@/lib/modules/accounting/documents";
import {
  updateStockForDocument, checkStockAvailability, updateAverageCostOnReceipt,
  updateAverageCostOnTransfer, updateTotalCostValue,
} from "@/lib/modules/accounting/stock";
import { recalculateBalance } from "@/lib/modules/accounting/balance";
import { autoPostDocument } from "@/lib/modules/accounting/journal";

export async function POST(request: NextRequest) {
  try {
    await requirePermission("documents:confirm");
    const session = await getAuthSession();

    const body = await request.json() as { ids?: unknown };
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "Не указаны документы" }, { status: 400 });
    }
    if (ids.length > 100) {
      return NextResponse.json({ error: "Максимум 100 документов за раз" }, { status: 400 });
    }

    let confirmed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const id of ids) {
      try {
        const doc = await db.document.findUnique({
          where: { id },
          include: { items: true },
        });

        if (!doc || doc.status !== "draft" || doc.items.length === 0) {
          skipped++;
          continue;
        }

        // Skip inventory counts in bulk mode (require manual confirmation)
        if (doc.type === "inventory_count") {
          skipped++;
          continue;
        }

        // Check stock availability for outgoing documents
        if (isStockDecrease(doc.type) && doc.warehouseId) {
          const shortages = await checkStockAvailability(
            doc.warehouseId,
            doc.items.map((i) => ({ productId: i.productId, quantity: i.quantity }))
          );
          if (shortages.length > 0) {
            skipped++;
            continue;
          }
        }

        // Check stock for transfers
        if (doc.type === "stock_transfer" && doc.warehouseId) {
          const shortages = await checkStockAvailability(
            doc.warehouseId,
            doc.items.map((i) => ({ productId: i.productId, quantity: i.quantity }))
          );
          if (shortages.length > 0) {
            skipped++;
            continue;
          }
        }

        // Confirm the document
        const confirmedDoc = await db.document.update({
          where: { id },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: {
            status: "confirmed",
            confirmedAt: new Date(),
            confirmedBy: session?.username ?? null,
          } as any,
          include: { items: true },
        });

        // Update stock
        if (affectsStock(doc.type)) {
          await updateStockForDocument(id);

          if (isStockIncrease(doc.type) && doc.warehouseId) {
            for (const item of doc.items) {
              await updateAverageCostOnReceipt(doc.warehouseId, item.productId, item.quantity, item.price);
            }
          } else if (doc.type === "stock_transfer" && doc.warehouseId && doc.targetWarehouseId) {
            for (const item of doc.items) {
              await updateAverageCostOnTransfer(doc.warehouseId, doc.targetWarehouseId, item.productId, item.quantity);
              await updateTotalCostValue(doc.warehouseId, item.productId);
            }
          } else if (isStockDecrease(doc.type) && doc.warehouseId) {
            for (const item of doc.items) {
              await updateTotalCostValue(doc.warehouseId, item.productId);
            }
          }
        }

        // Update counterparty balance
        if (affectsBalance(doc.type) && doc.counterpartyId) {
          await recalculateBalance(doc.counterpartyId);
        }

        // Journal posting
        try {
          await autoPostDocument(
            confirmedDoc.id,
            doc.number,
            confirmedDoc.confirmedAt ?? doc.date,
            doc.createdBy ?? undefined
          );
        } catch {
          // Non-critical
        }

        confirmed++;
      } catch {
        errors.push(id);
        skipped++;
      }
    }

    return NextResponse.json({ confirmed, skipped, errors });
  } catch (error) {
    return handleAuthError(error);
  }
}
