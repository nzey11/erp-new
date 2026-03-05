import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { validationError } from "@/lib/shared/validation";
import { getAuthSession } from "@/lib/shared/auth";
import { affectsStock, affectsBalance, isStockDecrease, isStockIncrease, isInventoryCount, getDocTypeName, getDocStatusName, generateDocumentNumber } from "@/lib/modules/accounting/documents";
import { updateStockForDocument, checkStockAvailability, updateAverageCostOnReceipt, updateAverageCostOnTransfer, updateTotalCostValue } from "@/lib/modules/accounting/stock";
import { recalculateBalance } from "@/lib/modules/accounting/balance";
import { autoPostDocument } from "@/lib/modules/accounting/journal";

type Params = { params: Promise<{ id: string }> };

/**
 * Create and confirm linked adjustment documents from an inventory count.
 * - write_off for items where actualQty < expectedQty (shortages)
 * - stock_receipt for items where actualQty > expectedQty (surpluses)
 */
async function createInventoryAdjustments(
  inventoryDocId: string,
  warehouseId: string,
  items: { productId: string; expectedQty: number | null; actualQty: number | null; difference: number | null; price: number }[],
  createdBy: string | null
) {
  const shortages = items.filter((i) => (i.difference ?? 0) < 0);
  const surpluses = items.filter((i) => (i.difference ?? 0) > 0);
  const createdDocs: string[] = [];

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

    const writeOff = await db.document.create({
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
        items: { create: writeOffItems },
      },
    });
    createdDocs.push(writeOff.id);

    // Update stock for write-off
    await updateStockForDocument(writeOff.id);
    for (const item of writeOffItems) {
      await updateTotalCostValue(warehouseId, item.productId);
    }
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

    const receipt = await db.document.create({
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
        items: { create: receiptItems },
      },
    });
    createdDocs.push(receipt.id);

    // Update stock for receipt
    await updateStockForDocument(receipt.id);
    for (const item of receiptItems) {
      await updateAverageCostOnReceipt(warehouseId, item.productId, item.quantity, item.price);
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
