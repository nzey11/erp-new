"use client";

import { useState, useEffect } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatRub, formatNumber } from "@/lib/shared/utils";

interface StockRecord {
  productId: string;
  productName: string;
  sku: string | null;
  warehouseId: string;
  warehouseName: string;
  unitShortName: string;
  quantity: number;
  reserve: number;
  available: number;
  purchasePrice: number | null;
  salePrice: number | null;
  costValue: number | null;
  saleValue: number | null;
}

interface StockTotals {
  totalQuantity: number;
  totalReserve: number;
  totalAvailable: number;
  totalCostValue: number | null;
  totalSaleValue: number | null;
}

interface ProductStockTabProps {
  productId: string;
  isActive: boolean; // Whether the tab is currently active
}

export function ProductStockTab({ productId, isActive }: ProductStockTabProps) {
  const [records, setRecords] = useState<StockRecord[]>([]);
  const [totals, setTotals] = useState<StockTotals | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Only load when tab becomes active and hasn't been loaded yet
    if (!isActive || loaded || !productId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/accounting/stock?productId=${productId}&enhanced=true`);
        const data = res.ok ? await res.json() : { records: [], totals: null };
        if (!cancelled) {
          setRecords(Array.isArray(data.records) ? data.records : []);
          setTotals(data.totals || null);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setRecords([]);
          setTotals(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isActive, loaded, productId]);

  if (loading) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        Загрузка данных о складских остатках...
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        Данные загрузятся при открытии вкладки
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        Нет данных о складских остатках
      </div>
    );
  }

  return (
    <div className="space-y-4 py-4">
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Склад</TableHead>
              <TableHead className="text-right">Кол-во</TableHead>
              <TableHead className="text-right">Резерв</TableHead>
              <TableHead className="text-right">Доступно</TableHead>
              <TableHead className="text-right">Себест.</TableHead>
              <TableHead className="text-right">Сумма себест.</TableHead>
              <TableHead className="text-right">Сумма продажи</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record, idx) => (
              <TableRow key={`${record.warehouseId}-${idx}`}>
                <TableCell className="font-medium">{record.warehouseName}</TableCell>
                <TableCell className="text-right">{formatNumber(record.quantity, 0)}</TableCell>
                <TableCell className="text-right text-orange-600">
                  {record.reserve > 0 ? formatNumber(record.reserve, 0) : "—"}
                </TableCell>
                <TableCell className="text-right text-green-600">
                  {formatNumber(record.available, 0)}
                </TableCell>
                <TableCell className="text-right">
                  {record.purchasePrice != null ? formatRub(record.purchasePrice) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {record.costValue != null ? formatRub(record.costValue) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {record.saleValue != null ? formatRub(record.saleValue) : "—"}
                </TableCell>
              </TableRow>
            ))}
            {/* Totals row */}
            {totals && (
              <TableRow className="bg-muted/50 font-medium">
                <TableCell>Итого</TableCell>
                <TableCell className="text-right">{formatNumber(totals.totalQuantity, 0)}</TableCell>
                <TableCell className="text-right text-orange-600">
                  {totals.totalReserve > 0 ? formatNumber(totals.totalReserve, 0) : "—"}
                </TableCell>
                <TableCell className="text-right text-green-600">
                  {formatNumber(totals.totalAvailable, 0)}
                </TableCell>
                <TableCell className="text-right">—</TableCell>
                <TableCell className="text-right">
                  {totals.totalCostValue != null ? formatRub(totals.totalCostValue) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {totals.totalSaleValue != null ? formatRub(totals.totalSaleValue) : "—"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Резерв — товары в незавершённых документах (отгрузки, возвраты, заказы).
      </p>
    </div>
  );
}
