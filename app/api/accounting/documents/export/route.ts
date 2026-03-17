import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/shared/authorization";
import { DocumentService } from "@/lib/modules/accounting";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("documents:read");

    const { searchParams } = new URL(request.url);
    const group = searchParams.get("group") || "";
    const type = searchParams.get("type") || "";
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";

    const docs = await DocumentService.exportDocuments({ group, type, dateFrom, dateTo });

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
