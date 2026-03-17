import type { ERPColumn } from "@/components/erp/erp-table.types";
import { createMoneyColumn, createDateColumn } from "@/components/erp/columns";
import type { PaymentWithRelations } from "@/lib/domain/payments/queries";

/**
 * Column definitions for payments table.
 * Framework-agnostic ERPColumn contract — no antd imports.
 */
export function getPaymentColumns(): ERPColumn<PaymentWithRelations>[] {
  return [
    {
      key: "number",
      title: "Номер",
      dataIndex: "number",
      width: 120,
      sortable: true,
    },
    createDateColumn<PaymentWithRelations>({
      key: "date",
      title: "Дата",
      accessor: (row) => row.date,
      width: 120,
      sortable: true,
    }),
    {
      key: "type",
      title: "Тип",
      dataIndex: "type",
      width: 100,
      sortable: true,
      render: (value) => (value === "income" ? "Приход" : "Расход"),
    },
    createMoneyColumn<PaymentWithRelations>({
      key: "amount",
      title: "Сумма",
      accessor: (row) => Number(row.amount),
      width: 140,
      sortable: true,
    }),
    {
      key: "category",
      title: "Категория",
      width: 160,
      render: (_, row) => row.category?.name || "—",
      ellipsis: true,
    },
    {
      key: "counterparty",
      title: "Контрагент",
      render: (_, row) => row.counterparty?.name || "—",
      ellipsis: true,
    },
    {
      key: "paymentMethod",
      title: "Способ оплаты",
      dataIndex: "paymentMethod",
      width: 140,
      render: (value) => {
        const map: Record<string, string> = {
          cash: "Наличные",
          bank_transfer: "Банк",
          card: "Карта",
        };
        return map[String(value)] || String(value);
      },
    },
    {
      key: "description",
      title: "Описание",
      dataIndex: "description",
      ellipsis: true,
      hidden: true, // Hidden by default, can be shown via column visibility
    },
  ];
}
