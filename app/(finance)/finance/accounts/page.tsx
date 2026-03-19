"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Tag, Button, Card } from "antd";
import { ERPTable } from "@/components/erp/erp-table";
import type { ERPColumn } from "@/components/erp/erp-table.types";
import { useDataGrid } from "@/lib/hooks/use-data-grid";
import { formatRub } from "@/lib/shared/utils";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  category: string;
  isActive: boolean;
  isSystem: boolean;
  parent?: { code: string; name: string } | null;
}

const TYPE_LABELS: Record<string, string> = {
  active: "Активный",
  passive: "Пассивный",
  active_passive: "Активно-пассивный",
};

const CATEGORY_LABELS: Record<string, string> = {
  asset: "Актив",
  liability: "Пассив",
  equity: "Капитал",
  income: "Доходы",
  expense: "Расходы",
};

const CATEGORY_COLORS: Record<string, string> = {
  asset: "blue",
  liability: "default",
  equity: "",
  income: "blue",
  expense: "default",
};

export default function AccountsPage() {
  const [includeInactive, setIncludeInactive] = useState(false);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const router = useRouter();

  const grid = useDataGrid<Account>({
    endpoint: `/api/accounting/accounts?includeInactive=${includeInactive}`,
    enablePagination: false,
    enableSearch: true,
    responseAdapter: (json) => ({
      data: Array.isArray(json) ? (json as Account[]) : [],
      total: 0,
    }),
  });

  useEffect(() => {
    fetch("/api/accounting/accounts/balances")
      .then((r) => r.json())
      .then((data) => setBalances(data ?? {}))
      .catch(() => {});
  }, []);

  const columns: ERPColumn<Account>[] = [
    {
      key: "code",
      dataIndex: "code",
      title: "Счет",
      width: 100,
      render: (_, row) => (
        <span className="font-mono font-semibold">{row.code}</span>
      ),
    },
    {
      key: "name",
      dataIndex: "name",
      title: "Наименование",
      width: 340,
      render: (_, row) => (
        <span className={row.parent ? "pl-4 text-sm" : "font-medium"}>
          {row.name}
        </span>
      ),
    },
    {
      key: "type",
      dataIndex: "type",
      title: "Вид",
      width: 160,
      render: (_, row) => (
        <span className="text-muted-foreground text-sm">
          {TYPE_LABELS[row.type] ?? row.type}
        </span>
      ),
    },
    {
      key: "category",
      dataIndex: "category",
      title: "Раздел",
      width: 120,
      render: (_, row) => (
        <Tag color={CATEGORY_COLORS[row.category] ?? ""}>
          {CATEGORY_LABELS[row.category] ?? row.category}
        </Tag>
      ),
    },
    {
      key: "balance",
      dataIndex: "id",
      title: "Остаток",
      width: 140,
      align: "right",
      render: (_, row) => {
        const bal = balances[row.id];
        if (bal === undefined || bal === 0) return <span className="text-muted-foreground text-sm">—</span>;
        return (
          <span className={`font-mono text-sm font-semibold ${bal > 0 ? "text-green-600" : "text-red-600"}`}>
            {formatRub(Math.abs(bal))}
          </span>
        );
      },
    },
    {
      key: "isSystem",
      dataIndex: "isSystem",
      title: "Тип",
      width: 100,
      render: (_, row) => (
        <Tag color={row.isSystem ? "default" : ""}>
          {row.isSystem ? "Системный" : "Пользов."}
        </Tag>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="План счетов"
        description="Рабочий план счетов бухгалтерского учёта (Приказ МФ №94н)"
      />

      <Card
        title={
          <div className="flex flex-row items-center justify-between">
            <span>Счета ({grid.data.length})</span>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setIncludeInactive(!includeInactive)}
            >
              {includeInactive ? "Скрыть неактивные" : "Показать неактивные"}
            </Button>
          </div>
        }
      >
        <ERPTable
          data={grid.data}
          columns={columns}
          loading={grid.loading}
          emptyText="Нет счетов"
          onRowClick={(row) => router.push(`/finance/journal?accountCode=${row.code}`)}
        />
      </Card>
    </div>
  );
}
