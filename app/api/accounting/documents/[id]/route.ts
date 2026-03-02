import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseBody, validationError } from "@/lib/shared/validation";
import { getDocTypeName, getDocStatusName } from "@/lib/modules/accounting/documents";
import { updateDocumentSchema } from "@/lib/modules/accounting/schemas/documents.schema";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission("documents:read");
    const { id } = await params;

    const document = await db.document.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, sku: true, unit: { select: { shortName: true } } },
            },
          },
        },
        warehouse: { select: { id: true, name: true } },
        targetWarehouse: { select: { id: true, name: true } },
        counterparty: { select: { id: true, name: true } },
        linkedDocument: { select: { id: true, number: true, type: true } },
        linkedFrom: { select: { id: true, number: true, type: true } },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    }

    return NextResponse.json({
      ...document,
      typeName: getDocTypeName(document.type),
      statusName: getDocStatusName(document.status),
      linkedDocument: document.linkedDocument ? {
        ...document.linkedDocument,
        typeName: getDocTypeName(document.linkedDocument.type),
      } : null,
      linkedFrom: document.linkedFrom.map((d) => ({
        ...d,
        typeName: getDocTypeName(d.type),
      })),
    });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("documents:write");
    const { id } = await params;
    const data = await parseBody(request, updateDocumentSchema);

    // Only draft documents can be edited
    const existing = await db.document.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    }
    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Редактирование возможно только для черновиков" },
        { status: 400 }
      );
    }

    const {
      date, warehouseId, targetWarehouseId, counterpartyId,
      paymentType, description, notes, items,
    } = data;

    let totalAmount = existing.totalAmount;

    // If items are provided, replace all items
    if (items !== undefined) {
      await db.documentItem.deleteMany({ where: { documentId: id } });

      totalAmount = 0;
      const itemsData = (items || []).map((item) => {
        const total = (item.quantity || 0) * (item.price || 0);
        totalAmount += total;
        return {
          documentId: id,
          productId: item.productId,
          quantity: item.quantity || 0,
          price: item.price || 0,
          total,
          expectedQty: item.expectedQty ?? null,
          actualQty: item.actualQty ?? null,
          difference: item.expectedQty != null && item.actualQty != null
            ? item.actualQty - item.expectedQty
            : null,
        };
      });

      if (itemsData.length > 0) {
        await db.documentItem.createMany({ data: itemsData });
      }
    }

    const updateData: Record<string, unknown> = { totalAmount };
    if (date !== undefined) updateData.date = new Date(date);
    if (warehouseId !== undefined) updateData.warehouseId = warehouseId || null;
    if (targetWarehouseId !== undefined) updateData.targetWarehouseId = targetWarehouseId || null;
    if (counterpartyId !== undefined) updateData.counterpartyId = counterpartyId || null;
    if (paymentType !== undefined) updateData.paymentType = paymentType || null;
    if (description !== undefined) updateData.description = description || null;
    if (notes !== undefined) updateData.notes = notes || null;

    const document = await db.document.update({
      where: { id },
      data: updateData,
      include: {
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        warehouse: { select: { id: true, name: true } },
        targetWarehouse: { select: { id: true, name: true } },
        counterparty: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      ...document,
      typeName: getDocTypeName(document.type),
      statusName: getDocStatusName(document.status),
    });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission("documents:write");
    const { id } = await params;

    const doc = await db.document.findUnique({ where: { id } });
    if (!doc) {
      return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    }
    if (doc.status !== "draft") {
      return NextResponse.json(
        { error: "Удаление возможно только для черновиков" },
        { status: 400 }
      );
    }

    await db.document.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}
