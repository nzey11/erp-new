import type { ERPColumn } from "@/components/erp/erp-table.types";
import { createStatusColumn } from "@/components/erp/columns";
import type { CounterpartyWithBalance } from "@/lib/domain/counterparties/queries";

const TYPE_LABELS: Record<string, string> = {
  customer: "Покупатель",
  supplier: "Поставщик",
  both: "Покупатель/Поставщик",
};

/**
 * Column definitions for counterparties table.
 * Framework-agnostic ERPColumn contract — no antd imports.
 */
export function getCounterpartyColumns(): ERPColumn<CounterpartyWithBalance>[] {
  return [
    {
      key: "name",
      title: "Название",
      dataIndex: "name",
      width: 240,
      sortable: true,
      ellipsis: true,
    },
    {
      key: "type",
      title: "Тип",
      dataIndex: "type",
      width: 160,
      sortable: true,
      render: (value) => TYPE_LABELS[String(value)] || String(value),
    },
    {
      key: "inn",
      title: "ИНН",
      dataIndex: "inn",
      width: 140,
      sortable: true,
      render: (value) => (value ? String(value) : "—"),
    },
    {
      key: "phone",
      title: "Телефон",
      dataIndex: "phone",
      width: 150,
      render: (value) => (value ? String(value) : "—"),
    },
    {
      key: "email",
      title: "Email",
      dataIndex: "email",
      width: 200,
      ellipsis: true,
      render: (value) => (value ? String(value) : "—"),
    },
    {
      key: "balance",
      title: "Баланс",
      width: 140,
      align: "right",
      sortable: false,
      render: (_, row) => {
        const balance = row.balance?.balanceRub ?? 0;
        const formatted = new Intl.NumberFormat("ru-RU", {
          style: "currency",
          currency: "RUB",
        }).format(balance);

        if (balance > 0) {
          return <span className="text-green-600">{formatted}</span>;
        } else if (balance < 0) {
          return <span className="text-red-600">{formatted}</span>;
        }
        return <span className="text-muted-foreground">{formatted}</span>;
      },
    },
    createStatusColumn<CounterpartyWithBalance>({
      key: "isActive",
      title: "Статус",
      accessor: (row) => row.isActive,
      width: 110,
      statusMap: {
        true:  { label: "Активен",   color: "success" },
        false: { label: "Неактивен", color: "default" },
      },
    }),
  ];
}
