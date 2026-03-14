import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { parseQuery, parseBody, validationError } from "@/lib/shared/validation";
import { generateDocumentNumber, getDocTypeName, getDocStatusName } from "@/lib/modules/accounting/documents";
import { queryDocumentsSchema, createDocumentSchema } from "@/lib/modules/accounting/schemas/documents.schema";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("documents:read");

    const query = parseQuery(request, queryDocumentsSchema);
    const { type, types, status, warehouseId, counterpartyId, dateFrom, dateTo, search, page = 1, limit = 50 } = query;

    const where: Record<string, unknown> = {};
    if (types) {
      where.type = { in: types.split(",") };
    } else if (type) {
      where.type = type;
    }
    if (status) where.status = status;
    if (warehouseId) where.warehouseId = warehouseId;
    if (counterpartyId) where.counterpartyId = counterpartyId;
    if (search) where.number = { contains: search };
    if (dateFrom || dateTo) {
      where.date = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo) }),
      };
    }

    const [documents, total] = await Promise.all([
      db.document.findMany({
        where,
        include: {
          warehouse: { select: { id: true, name: true } },
          targetWarehouse: { select: { id: true, name: true } },
          counterparty: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true, phone: true, telegramUsername: true } },
          _count: { select: { items: true } },
        },
        orderBy: { date: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.document.count({ where }),
    ]);

    const enriched = documents.map((doc) => ({
      ...doc,
      typeName: getDocTypeName(doc.type),
      statusName: getDocStatusName(doc.status),
    }));

    return NextResponse.json({ data: enriched, total, page, limit });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission("documents:write");

    // tenantId ONLY from session — never from request body (security)
    const tenantId = user.tenantId;

    const data = await parseBody(request, createDocumentSchema);
    const {
      type,
      date,
      warehouseId,
      targetWarehouseId,
      counterpartyId,
      paymentType,
      description,
      notes,
      items,
      linkedDocumentId,
    } = data;

    const number = await generateDocumentNumber(type);

    // Validate tenant consistency with warehouse
    if (warehouseId) {
      const warehouse = await db.warehouse.findUnique({
        where: { id: warehouseId },
        select: { tenantId: true },
      });
      if (!warehouse) {
        return NextResponse.json({ error: "Склад не найден" }, { status: 404 });
      }
      if (warehouse.tenantId !== tenantId) {
        return NextResponse.json(
          { error: "Склад принадлежит другому тенанту" },
          { status: 400 }
        );
      }
    }

    // Validate tenant consistency with target warehouse (for stock_transfer)
    if (targetWarehouseId) {
      const targetWarehouse = await db.warehouse.findUnique({
        where: { id: targetWarehouseId },
        select: { tenantId: true },
      });
      if (!targetWarehouse) {
        return NextResponse.json({ error: "Целевой склад не найден" }, { status: 404 });
      }
      if (targetWarehouse.tenantId !== tenantId) {
        return NextResponse.json(
          { error: "Целевой склад принадлежит другому тенанту" },
          { status: 400 }
        );
      }
    }

    // Calculate total from items
    let totalAmount = 0;
    const itemsData = (items || []).map((item) => {
      const total = (item.quantity || 0) * (item.price || 0);
      totalAmount += total;
      return {
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

    const document = await db.document.create({
      data: {
        tenantId,  // From session, not from client
        number,
        type,
        date: date ? new Date(date) : new Date(),
        warehouseId: warehouseId || null,
        targetWarehouseId: targetWarehouseId || null,
        counterpartyId: counterpartyId || null,
        linkedDocumentId: linkedDocumentId || null,
        totalAmount,
        paymentType: paymentType || null,
        description: description || null,
        notes: notes || null,
        createdBy: user.id,
        items: { create: itemsData },
      },
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
    }, { status: 201 });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleAuthError(error);
  }
}
