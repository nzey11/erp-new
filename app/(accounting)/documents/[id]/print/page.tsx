"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "antd";
import { Printer, ArrowLeft } from "lucide-react";
import { formatRub, formatDate, formatDateTime } from "@/lib/shared/utils";
import Link from "next/link";

interface DocumentItem {
  id: string;
  quantity: number;
  price: number;
  total: number;
  product: { name: string; sku: string | null; unit?: { shortName: string } };
}

interface DocumentDetail {
  id: string;
  number: string;
  type: string;
  typeName: string;
  status: string;
  statusName: string;
  date: string;
  totalAmount: number;
  description: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
  warehouse: { id: string; name: string } | null;
  targetWarehouse: { id: string; name: string } | null;
  counterparty: { id: string; name: string } | null;
  items: DocumentItem[];
}

function numToWords(n: number): string {
  // Simple Russian number-to-words for amounts
  const rub = Math.floor(n);
  const kop = Math.round((n - rub) * 100);
  return `${rub.toLocaleString("ru-RU")} руб. ${String(kop).padStart(2, "0")} коп.`;
}

export default function DocumentPrintPage() {
  const params = useParams();
  const id = params.id as string;

  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDoc = useCallback(async () => {
    try {
      const res = await fetch(`/api/accounting/documents/${id}`);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      setDoc(data);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadDoc(); }, [loadDoc]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Документ не найден</p>
      </div>
    );
  }

  const isInvoice = ["sales_order", "outgoing_shipment", "incoming_shipment", "purchase_order"].includes(doc.type);

  return (
    <div className="min-h-screen bg-white">
      {/* Print toolbar - hidden when printing */}
      <div className="no-print bg-muted/30 border-b px-6 py-3 flex items-center gap-3">
        <Link href={`/documents/${id}`}>
          <Button type="text" size="small">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Назад
          </Button>
        </Link>
        <span className="text-sm text-muted-foreground flex-1">
          {doc.typeName} №{doc.number}
        </span>
        <Button type="primary" size="small" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" />
          Печать
        </Button>
      </div>

      {/* Print content */}
      <div className="print-page p-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-xl font-bold uppercase tracking-wide">
            {doc.typeName}
          </h1>
          <h2 className="text-lg font-semibold mt-1">
            №{doc.number} от {formatDate(doc.date)}
          </h2>
        </div>

        {/* Parties */}
        <div className="grid grid-cols-2 gap-8 mb-6 text-sm">
          {doc.counterparty && (
            <div>
              <p className="font-semibold text-xs uppercase text-gray-500 mb-1">
                {["incoming_shipment", "purchase_order", "supplier_return"].includes(doc.type)
                  ? "Поставщик"
                  : "Покупатель"}
              </p>
              <p className="font-medium">{doc.counterparty.name}</p>
            </div>
          )}
          <div>
            {doc.warehouse && (
              <div>
                <p className="font-semibold text-xs uppercase text-gray-500 mb-1">Склад</p>
                <p className="font-medium">{doc.warehouse.name}</p>
              </div>
            )}
            {doc.targetWarehouse && (
              <div className="mt-2">
                <p className="font-semibold text-xs uppercase text-gray-500 mb-1">Склад-получатель</p>
                <p className="font-medium">{doc.targetWarehouse.name}</p>
              </div>
            )}
          </div>
        </div>

        {/* Items table */}
        <table className="w-full text-sm border-collapse mb-6">
          <thead>
            <tr className="border border-gray-400 bg-gray-100">
              <th className="border border-gray-400 px-2 py-1.5 text-left w-8">#</th>
              <th className="border border-gray-400 px-2 py-1.5 text-left">Наименование</th>
              <th className="border border-gray-400 px-2 py-1.5 text-left w-20">Артикул</th>
              <th className="border border-gray-400 px-2 py-1.5 text-center w-12">Ед.</th>
              <th className="border border-gray-400 px-2 py-1.5 text-right w-20">Кол-во</th>
              {isInvoice && (
                <>
                  <th className="border border-gray-400 px-2 py-1.5 text-right w-24">Цена</th>
                  <th className="border border-gray-400 px-2 py-1.5 text-right w-28">Сумма</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {doc.items.map((item, i) => (
              <tr key={item.id} className="border border-gray-300">
                <td className="border border-gray-300 px-2 py-1 text-center">{i + 1}</td>
                <td className="border border-gray-300 px-2 py-1">{item.product.name}</td>
                <td className="border border-gray-300 px-2 py-1 text-xs text-gray-600">{item.product.sku || "—"}</td>
                <td className="border border-gray-300 px-2 py-1 text-center">{item.product.unit?.shortName || "шт."}</td>
                <td className="border border-gray-300 px-2 py-1 text-right font-mono">{item.quantity}</td>
                {isInvoice && (
                  <>
                    <td className="border border-gray-300 px-2 py-1 text-right font-mono">{formatRub(item.price)}</td>
                    <td className="border border-gray-300 px-2 py-1 text-right font-mono font-semibold">{formatRub(item.total)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
          {isInvoice && (
            <tfoot>
              <tr>
                <td colSpan={6} className="border border-gray-400 px-2 py-1.5 text-right font-semibold">
                  Итого:
                </td>
                <td className="border border-gray-400 px-2 py-1.5 text-right font-bold">
                  {formatRub(doc.totalAmount)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>

        {/* Total in words */}
        {isInvoice && (
          <div className="text-sm mb-6">
            <span className="font-semibold">Итого к оплате: </span>
            {numToWords(doc.totalAmount)}
          </div>
        )}

        {/* Description / Notes */}
        {(doc.description || doc.notes) && (
          <div className="text-sm mb-6 space-y-1">
            {doc.description && <p><span className="font-semibold">Основание: </span>{doc.description}</p>}
            {doc.notes && <p><span className="font-semibold">Примечание: </span>{doc.notes}</p>}
          </div>
        )}

        {/* Audit info */}
        <div className="text-xs text-gray-500 mt-2">
          <p>Документ создан: {formatDateTime(doc.createdAt)}{doc.createdBy ? ` (${doc.createdBy})` : ""}</p>
          {doc.confirmedAt && (
            <p>Подтверждён: {formatDateTime(doc.confirmedAt)}{doc.confirmedBy ? ` (${doc.confirmedBy})` : ""}</p>
          )}
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-16 mt-12 text-sm">
          <div>
            <p className="font-semibold mb-6">Отпустил:</p>
            <div className="border-b border-black w-48 mb-1" />
            <p className="text-xs text-gray-500">(подпись, ФИО)</p>
          </div>
          <div>
            <p className="font-semibold mb-6">Принял:</p>
            <div className="border-b border-black w-48 mb-1" />
            <p className="text-xs text-gray-500">(подпись, ФИО)</p>
          </div>
        </div>

        {/* Stamp area */}
        <div className="mt-8 text-center text-xs text-gray-400 no-print">
          Нажмите &quot;Печать&quot; для вывода на бумагу или сохранения в PDF
        </div>
      </div>
    </div>
  );
}
