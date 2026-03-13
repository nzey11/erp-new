import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { validationError } from "@/lib/shared/validation";
import { getAuthSession } from "@/lib/shared/auth";
import { affectsStock, affectsBalance, isStockDecrease, isStockIncrease, isInventoryCount, getDocTypeName, getDocStatusName, generateDocumentNumber } from "@/lib/modules/accounting/documents";
import { updateStockForDocument, checkStockAvailability, updateAverageCostOnReceipt, updateAverageCostOnTransfer, updateTotalCostValue } from "@/lib/modules/accounting/stock";
import { recalculateBalance } from "@/lib/modules/accounting/balance";
import { autoPostDocument } from "@/lib/modules/accounting/journal";
import { createMovementsForDocument, documentHasMovements } from "@/lib/modules/accounting/stock-movements";

type Params = { params: Promise<{ id: string }> };

/**
 * Create and confirm linked adjustment documents from an inventory count.
 * - write_off for items where actualQty < expectedQty (shortages)
 * - stock_receipt for items where actualQty > expectedQty (surpluses)
 * 
 * IDEMPOTENT: Uses adjustmentsCreated flag + DB check for existing documents.
 */
async function createInventoryAdjustments(
  inventoryDocId: string,
  warehouseId: string,
  items: { productId: string; expectedQty: number | null; actualQty: number | null; difference: number | null; price: number }[],
  createdBy: string | null
) {
  // Idempotency check 1: Get inventory document state
  const inventoryDoc = await db.document.findUnique({
    where: { id: inventoryDocId },
    select: { adjustmentsCreated: true },
  });
  
  if (inventoryDoc?.adjustmentsCreated) {
    // Idempotency check 2: Verify actual documents exist (recovery after crash)
    const existingAdjustments = await db.document.count({
      where: {
        linkedDocumentId: inventoryDocId,
        type: { in: ["write_off", "stock_receipt"] },
      },
    });
    
    if (existingAdjustments > 0) {
      // Already created, exit idempotently
      return [];
    }
    // Flag set but no documents - reset flag and continue
  }
  
  // Idempotency check 3: Check for existing documents (even if flag not set)
  const existingDocs = await db.document.findMany({
    where: {
      linkedDocumentId: inventoryDocId,
      type: { in: ["write_off", "stock_receipt"] },
    },
  });
  
  if (existingDocs.length > 0) {
    // Documents exist - just set flag and exit
    await db.document.update({
      where: { id: inventoryDocId },
      data: { adjustmentsCreated: true },
    });
    return existingDocs.map((d) => d.id);
  }

  const shortages = items.filter((i) => (i.difference ?? 0) < 0);
  const surpluses = items.filter((i) => (i.difference ?? 0) > 0);
  const createdDocs: string[] = [];

  // Use transaction for atomicity
  await db.$transaction(async (tx) => {
    // Create write_off for shortages
    if (shortages.length > 0) {
      const number = await generateDocumentNumber("write_off");
      const writeOffItems = shortages.map((item) => {
        const qty = Math.abs(item.difference ?? 0);
        return {
          productId: item.productId,
          quantity: qty,
          price: item.price,
          total: qty * item.price,
        };
      });
      const totalAmount = writeOffItems.reduce((sum, i) => sum + i.total, 0);

      const writeOff = await tx.document.create({
        data: {
          number,
          type: "write_off",
          status: "confirmed",
          date: new Date(),
          warehouseId,
          linkedDocumentId: inventoryDocId,
          totalAmount,
          description: `Списание по инвентаризации`,
          createdBy,
          confirmedAt: new Date(),
          adjustmentsCreated: true, // These are adjustment docs
          items: { create: writeOffItems },
        },
      });
      createdDocs.push(writeOff.id);
    }

    // Create stock_receipt for surpluses
    if (surpluses.length > 0) {
      const number = await generateDocumentNumber("stock_receipt");
      const receiptItems = surpluses.map((item) => {
        const qty = item.difference ?? 0;
        return {
          productId: item.productId,
          quantity: qty,
          price: item.price,
          total: qty * item.price,
        };
      });
      const totalAmount = receiptItems.reduce((sum, i) => sum + i.total, 0);

      const receipt = await tx.document.create({
        data: {
          number,
          type: "stock_receipt",
          status: "confirmed",
          date: new Date(),
          warehouseId,
          linkedDocumentId: inventoryDocId,
          totalAmount,
          description: `Оприходование по инвентаризации`,
          createdBy,
          confirmedAt: new Date(),
          adjustmentsCreated: true, // These are adjustment docs
          items: { create: receiptItems },
        },
      });
      createdDocs.push(receipt.id);
    }

    // Set flag on inventory document (at the end of transaction)
    if (createdDocs.length > 0) {
      await tx.document.update({
        where: { id: inventoryDocId },
        data: { adjustmentsCreated: true },
      });
    }
  });

  // Update stock projections (outside transaction - non-critical)
  for (const docId of createdDocs) {
    await updateStockForDocument(docId);
  }
  
  // Create stock movements for adjustment documents
  for (const docId of createdDocs) {
    const adjDoc = await db.document.findUnique({
      where: { id: docId },
      include: { items: true },
    });
    
    if (adjDoc && adjDoc.warehouseId) {
      await createMovementsForDocument({
        id: adjDoc.id,
        type: adjDoc.type,
        warehouseId: adjDoc.warehouseId,
        targetWarehouseId: adjDoc.targetWarehouseId,
        items: adjDoc.items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
          price: i.price,
        })),
      });
    }
  }

  return createdDocs;
}

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission("documents:confirm");
    const { id } = await params;
    const session = await getAuthSession();

    const doc = await db.document.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!doc) {
      return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    }
    if (doc.status !== "draft") {
      return NextResponse.json(
        { error: "Только черновики можно подтвердить" },
        { status: 400 }
      );
    }
    if (doc.items.length === 0) {
      return NextResponse.json(
        { error: "Нельзя подтвердить документ без позиций" },
        { status: 400 }
      );
    }

    // Inventory count: validate actualQty is filled
    if (isInventoryCount(doc.type)) {
      const missingActual = doc.items.some((i) => i.actualQty == null);
      if (missingActual) {
        return NextResponse.json(
          { error: "Заполните фактическое количество для всех позиций" },
          { status: 400 }
        );
      }
      if (!doc.warehouseId) {
        return NextResponse.json(
          { error: "Укажите склад для инвентаризации" },
          { status: 400 }
        );
      }
    }

    // Check stock availability for outgoing documents
    if (isStockDecrease(doc.type) && doc.warehouseId) {
      const shortages = await checkStockAvailability(
        doc.warehouseId,
        doc.items.map((i) => ({ productId: i.productId, quantity: i.quantity }))
      );
      if (shortages.length > 0) {
        // Enrich with product names
        const products = await db.product.findMany({
          where: { id: { in: shortages.map((s) => s.productId) } },
          select: { id: true, name: true },
        });
        const productMap = new Map(products.map((p) => [p.id, p.name]));

        return NextResponse.json({
          error: "Недостаточно остатков на складе",
          shortages: shortages.map((s) => ({
            ...s,
            productName: productMap.get(s.productId) || s.productId,
          })),
        }, { status: 400 });
      }
    }

    // Check stock for transfers (source warehouse)
    if (doc.type === "stock_transfer" && doc.warehouseId) {
      const shortages = await checkStockAvailability(
        doc.warehouseId,
        doc.items.map((i) => ({ productId: i.productId, quantity: i.quantity }))
      );
      if (shortages.length > 0) {
        const products = await db.product.findMany({
          where: { id: { in: shortages.map((s) => s.productId) } },
          select: { id: true, name: true },
        });
        const productMap = new Map(products.map((p) => [p.id, p.name]));

        return NextResponse.json({
          error: "Недостаточно остатков на складе-источнике",
          shortages: shortages.map((s) => ({
            ...s,
            productName: productMap.get(s.productId) || s.productId,
          })),
        }, { status: 400 });
      }
    }

    // Confirm the document
    const confirmed = await db.document.update({
      where: { id },
      data: {
        status: "confirmed",
        confirmedAt: new Date(),
        confirmedBy: session?.username ?? null,
      },
      include: {
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        warehouse: { select: { id: true, name: true } },
        targetWarehouse: { select: { id: true, name: true } },
        counterparty: { select: { id: true, name: true } },
      },
    });

    // Handle inventory count: create linked adjustment documents
    if (isInventoryCount(doc.type) && doc.warehouseId) {
      const adjustmentItems = doc.items.map((i) => ({
        productId: i.productId,
        expectedQty: i.expectedQty,
        actualQty: i.actualQty,
        difference: i.difference ?? ((i.actualQty ?? 0) - (i.expectedQty ?? 0)),
        price: i.price,
      }));

      const hasDiscrepancies = adjustmentItems.some((i) => (i.difference ?? 0) !== 0);
      if (hasDiscrepancies) {
        await createInventoryAdjustments(
          id,
          doc.warehouseId,
          adjustmentItems,
          doc.createdBy
        );
      }
    }

    // Update stock if applicable (non-inventory documents)
    if (affectsStock(doc.type)) {
      // Create immutable stock movements (idempotent)
      await createMovementsForDocument({
        id: confirmed.id,
        type: confirmed.type,
        warehouseId: confirmed.warehouseId,
        targetWarehouseId: confirmed.targetWarehouseId,
        items: doc.items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
          price: i.price,
        })),
      });

      // Update StockRecord projections (legacy compatibility)
      await updateStockForDocument(id);

      // Update average cost based on document type
      if (isStockIncrease(doc.type) && doc.warehouseId) {
        // Incoming documents: recalculate average cost
        for (const item of doc.items) {
          await updateAverageCostOnReceipt(
            doc.warehouseId,
            item.productId,
            item.quantity,
            item.price
          );
        }
      } else if (doc.type === "stock_transfer" && doc.warehouseId && doc.targetWarehouseId) {
        // Transfer: target warehouse receives at source's average cost
        for (const item of doc.items) {
          await updateAverageCostOnTransfer(
            doc.warehouseId,
            doc.targetWarehouseId,
            item.productId,
            item.quantity
          );
          // Update source warehouse totalCostValue (avgCost unchanged, qty decreased)
          await updateTotalCostValue(doc.warehouseId, item.productId);
        }
      } else if (isStockDecrease(doc.type) && doc.warehouseId) {
        // Outgoing documents: update totalCostValue (avgCost unchanged)
        for (const item of doc.items) {
          await updateTotalCostValue(doc.warehouseId, item.productId);
        }
      }
    }

    // Update counterparty balance if applicable
    if (affectsBalance(doc.type) && doc.counterpartyId) {
      await recalculateBalance(doc.counterpartyId);
    }

    // Auto-post to accounting journal (double-entry)
    try {
      await autoPostDocument(
        confirmed.id,
        confirmed.number,
        confirmed.confirmedAt ?? confirmed.date,
        confirmed.createdBy ?? undefined
      );
    } catch {
      // Non-critical: journal posting failure should not block document confirmation
    }

    // Auto-create finance payment only for actual shipments (not purchase orders — those are just orders, no money moves yet)
    if (doc.type === "incoming_shipment" || doc.type === "outgoing_shipment") {
      try {
        const isPurchase = doc.type === "incoming_shipment";
        const paymentType = isPurchase ? "expense" : "income";
        const categoryName = isPurchase ? "Оплата поставщику" : "Оплата от покупателя";

        const category = await db.financeCategory.findFirst({
          where: { name: categoryName, type: paymentType, isActive: true },
        });

        if (category && doc.totalAmount > 0) {
          const counter = await db.paymentCounter.update({
            where: { prefix: "PAY" },
            data: { lastNumber: { increment: 1 } },
          });
          const paymentNumber = `${counter.prefix}-${String(counter.lastNumber).padStart(6, "0")}`;

          await db.payment.create({
            data: {
              number: paymentNumber,
              type: paymentType,
              categoryId: category.id,
              counterpartyId: doc.counterpartyId ?? null,
              documentId: doc.id,
              amount: doc.totalAmount,
              paymentMethod: doc.paymentType ?? "bank_transfer",
              date: new Date(),
              description: `Авто: по документу ${doc.number}`,
            },
          });
        }
      } catch {
        // Non-critical: payment creation failure should not block document confirmation
      }
    }

    return NextResponse.json({
      ...confirmed,
      typeName: getDocTypeName(confirmed.type),
      statusName: getDocStatusName(confirmed.status),
    });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}
