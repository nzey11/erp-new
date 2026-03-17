import { Space } from "antd";
import type { ERPColumn } from "@/components/erp/erp-table.types";
import { formatRub, formatNumber } from "@/lib/shared/utils";
import type { StockBalanceRow } from "@/lib/domain/stock/queries";

/**
 * Column definitions for the stock balances table.
 *
 * No row actions — stock balances are read-only.
 * No sort needed — records are grouped/sorted server-side by product name.
 */
export function getStockBalanceColumns(): ERPColumn<StockBalanceRow>[] {
  return [
    {
      key: "productName",
      title: "Товар",
      dataIndex: "productName",
      ellipsis: true,
      render: (_value, row) => (
        <Space orientation="vertical" size={0}>
          <span className="font-medium">{row.productName}</span>
          {row.sku && (
            <span className="text-xs text-gray-400">
              {row.sku} · {row.unitShortName}
            </span>
          )}
          {!row.sku && (
            <span className="text-xs text-gray-400">{row.unitShortName}</span>
          )}
        </Space>
      ),
    },
    {
      key: "categoryName",
      title: "Категория",
      dataIndex: "categoryName",
      width: 160,
      ellipsis: true,
      render: (_value, row) =>
        row.categoryName ? (
          <span className="text-sm text-gray-600">{row.categoryName}</span>
        ) : (
          <span className="text-gray-300">—</span>
        ),
    },
    {
      key: "warehouseName",
      title: "Склад",
      dataIndex: "warehouseName",
      width: 160,
      ellipsis: true,
      render: (_value, row) => (
        <span className="text-sm">{row.warehouseName}</span>
      ),
    },
    {
      key: "quantity",
      title: "Количество",
      dataIndex: "quantity",
      width: 120,
      align: "right",
      render: (_value, row) => (
        <span className="font-mono text-sm">
          {formatNumber(row.quantity, 2)}
        </span>
      ),
    },
    {
      key: "reserve",
      title: "Резерв",
      dataIndex: "reserve",
      width: 110,
      align: "right",
      render: (_value, row) =>
        row.reserve > 0 ? (
          <span className="font-mono text-sm text-amber-600">
            {formatNumber(row.reserve, 2)}
          </span>
        ) : (
          <span className="font-mono text-sm text-gray-400">0</span>
        ),
    },
    {
      key: "available",
      title: "Доступно",
      dataIndex: "available",
      width: 120,
      align: "right",
      render: (_value, row) => (
        <span
          className={
            row.available < 0
              ? "font-mono text-sm font-bold text-red-600"
              : "font-mono text-sm"
          }
        >
          {formatNumber(row.available, 2)}
        </span>
      ),
    },
    {
      key: "costValue",
      title: "Себестоимость",
      dataIndex: "costValue",
      width: 150,
      align: "right",
      render: (_value, row) =>
        row.costValue != null ? (
          <span className="font-mono text-sm">{formatRub(row.costValue)}</span>
        ) : (
          <span className="text-gray-300">—</span>
        ),
    },
    {
      key: "saleValue",
      title: "Цена реализации",
      dataIndex: "saleValue",
      width: 160,
      align: "right",
      render: (_value, row) =>
        row.saleValue != null ? (
          <span className="font-mono text-sm">{formatRub(row.saleValue)}</span>
        ) : (
          <span className="text-gray-300">—</span>
        ),
    },
  ];
}
