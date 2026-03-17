"use client";

import type { ERPColumn } from "@/components/erp/erp-table.types";
import { createDateColumn } from "@/components/erp/columns";
import { createMoneyColumn } from "@/components/erp/columns";
import { createDocumentNumberColumn } from "@/components/erp/document/document-number-column";
import { createDocumentStatusColumn } from "@/components/erp/document/document-status-column";
import { CounterpartyCell } from "@/components/erp/document/counterparty-cell";
import type { DocumentRow } from "@/lib/domain/documents/queries";

/**
 * Column definitions for the sales simple-tabs list.
 * Uses document-family shared primitives.
 * Does NOT include EcomStatus / paymentStatus / deliveryType —
 * those belong to SalesOrdersView (Step 4b).
 */
export function getSalesColumns(): ERPColumn<DocumentRow>[] {
  return [
    createDocumentNumberColumn<DocumentRow>({ width: 130 }),

    {
      key: "typeName",
      title: "Тип",
      dataIndex: "typeName",
      width: 200,
      sortable: false,
      render: (value) => <span className="text-sm">{String(value)}</span>,
    },

    createDateColumn<DocumentRow>({
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
      title: "Контрагент",
      width: 200,
      ellipsis: true,
      render: (_value, row) => (
        <CounterpartyCell counterparty={row.counterparty} />
      ),
    },

    createMoneyColumn<DocumentRow>({
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

    createDocumentStatusColumn<DocumentRow>({
      accessor: (row) => row.status,
      width: 130,
      sortable: true,
    }),
  ];
}
