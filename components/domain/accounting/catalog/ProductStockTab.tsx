"use client";

import { useState, useEffect } from "react";
import { Table } from "antd";
import type { TableColumnsType } from "antd";
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

  const columns: TableColumnsType<StockRecord> = [
    { key: "warehouse", dataIndex: "warehouseName", title: "Склад", render: (name: string) => <span className="font-medium">{name}</span> },
    { key: "quantity", dataIndex: "quantity", title: "Кол-во", align: "right", render: (qty: number) => formatNumber(qty, 0) },
    { key: "reserve", dataIndex: "reserve", title: "Резерв", align: "right", render: (reserve: number) => (reserve > 0 ? <span className="text-orange-600">{formatNumber(reserve, 0)}</span> : "—") },
    { key: "available", dataIndex: "available", title: "Доступно", align: "right", render: (avail: number) => <span className="text-green-600">{formatNumber(avail, 0)}</span> },
    { key: "purchasePrice", dataIndex: "purchasePrice", title: "Себест.", align: "right", render: (price: number | null) => (price != null ? formatRub(price) : "—") },
    { key: "costValue", dataIndex: "costValue", title: "Сумма себест.", align: "right", render: (val: number | null) => (val != null ? formatRub(val) : "—") },
    { key: "saleValue", dataIndex: "saleValue", title: "Сумма продажи", align: "right", render: (val: number | null) => (val != null ? formatRub(val) : "—") },
  ];

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
        <Table
          columns={columns}
          dataSource={records}
          rowKey={(record, index) => `${record.warehouseId}-${index}`}
          pagination={false}
          summary={() =>
            totals ? (
              <Table.Summary.Row className="bg-muted/50 font-medium">
                <Table.Summary.Cell index={0}>Итого</Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  {formatNumber(totals.totalQuantity, 0)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right" className="text-orange-600">
                  {totals.totalReserve > 0 ? formatNumber(totals.totalReserve, 0) : "—"}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right" className="text-green-600">
                  {formatNumber(totals.totalAvailable, 0)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">
                  —
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right">
                  {totals.totalCostValue != null ? formatRub(totals.totalCostValue) : "—"}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={6} align="right">
                  {totals.totalSaleValue != null ? formatRub(totals.totalSaleValue) : "—"}
                </Table.Summary.Cell>
              </Table.Summary.Row>
            ) : null
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Резерв — товары в незавершённых документах (отгрузки, возвраты, заказы).
      </p>
    </div>
  );
}
