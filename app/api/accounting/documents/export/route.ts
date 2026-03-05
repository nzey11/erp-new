import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";

const GROUP_TYPES: Record<string, string[]> = {
  purchases: ["purchase_order", "incoming_shipment", "supplier_return"],
  sales: ["outgoing_shipment", "customer_return", "sales_order"],
  stock: ["inventory_count", "write_off", "stock_receipt", "stock_transfer"],
};

export async function GET(request: NextRequest) {
  try {
    await requirePermission("documents:read");

    const { searchParams } = new URL(request.url);
    const group = searchParams.get("group") || "";
    const type = searchParams.get("type") || "";
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";

    const where: Record<string, unknown> = {};

    if (type) {
      where.type = type;
    } else if (group && GROUP_TYPES[group]) {
      where.type = { in: GROUP_TYPES[group] };
    }

    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (dateFrom) dateFilter.gte = new Date(dateFrom);
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        dateFilter.lte = to;
      }
      where.date = dateFilter;
    }

    const docs = await db.document.findMany({
      where,
      include: {
        counterparty: { select: { name: true } },
        warehouse: { select: { name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { date: "desc" },
    });

    const header = ["Номер", "Тип", "Дата", "Статус", "Контрагент", "Склад", "Позиций", "Сумма", "Примечание"].join(",");

    const rows = docs.map((d) => {
      return [
        `"${d.number}"`,
        d.type,
        new Date(d.date).toLocaleDateString("ru-RU"),
        d.status,
        d.counterparty ? `"${d.counterparty.name}"` : "",
        d.warehouse ? `"${d.warehouse.name}"` : "",
        d._count.items,
        d.totalAmount.toFixed(2),
        d.notes ? `"${d.notes.replace(/"/g, "'")}"` : "",
      ].join(",");
    });

    const csv = "\uFEFF" + [header, ...rows].join("\n");
    const filename = `${group || type || "documents"}_${new Date().toISOString().split("T")[0]}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
