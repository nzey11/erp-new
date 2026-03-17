import type { ERPColumn } from "@/components/erp/erp-table.types";
import { createDateColumn, createMoneyColumn } from "@/components/erp/columns";
import { createDocumentNumberColumn } from "@/components/erp/document/document-number-column";
import { createDocumentStatusColumn } from "@/components/erp/document/document-status-column";
import { CounterpartyCell } from "@/components/erp/document/counterparty-cell";
import type { PurchaseDocument } from "@/lib/domain/purchases/queries";

/**
 * Column definitions for the purchases table.
 */
export function getPurchaseColumns(): ERPColumn<PurchaseDocument>[] {
  return [
    createDocumentNumberColumn<PurchaseDocument>({ width: 120 }),

    {
      key: "typeName",
      title: "Тип",
      dataIndex: "typeName",
      width: 180,
      sortable: false,
      render: (value) => <span className="text-sm">{String(value)}</span>,
    },

    createDateColumn<PurchaseDocument>({
      key: "date",
      title: "Дата",
      accessor: (row) => row.date,
      width: 110,
      sortable: true,
    }),

    {
      key: "warehouse",
      title: "Склад",
      width: 160,
      ellipsis: true,
      render: (_value, row) => (
        <span className="text-sm text-muted-foreground">
          {row.warehouse?.name || "—"}
        </span>
      ),
    },

    {
      key: "counterparty",
      title: "Поставщик",
      width: 200,
      ellipsis: true,
      render: (_value, row) => (
        <CounterpartyCell counterparty={row.counterparty} />
      ),
    },

    createMoneyColumn<PurchaseDocument>({
      key: "totalAmount",
      title: "Сумма",
      accessor: (row) => row.totalAmount,
      width: 140,
      sortable: true,
    }),

    {
      key: "itemsCount",
      title: "Позиций",
      width: 90,
      align: "right",
      render: (_value, row) => (
        <span className="font-mono text-sm">{row._count.items}</span>
      ),
    },

    createDocumentStatusColumn<PurchaseDocument>({
      accessor: (row) => row.status,
      width: 130,
      sortable: true,
    }),
  ];
}
