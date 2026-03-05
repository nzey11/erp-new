"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataGrid } from "@/components/ui/data-grid";
import type { DataGridColumn } from "@/components/ui/data-grid";
import { useDataGrid } from "@/lib/hooks/use-data-grid";

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

const CATEGORY_COLORS: Record<string, "default" | "secondary" | "outline"> = {
  asset: "default",
  liability: "secondary",
  equity: "outline",
  income: "default",
  expense: "secondary",
};

export default function AccountsPage() {
  const [includeInactive, setIncludeInactive] = useState(false);

  const grid = useDataGrid<Account>({
    endpoint: `/api/accounting/accounts?includeInactive=${includeInactive}`,
    enablePagination: false,
    enableSearch: true,
    responseAdapter: (json) => ({
      data: Array.isArray(json) ? (json as Account[]) : [],
      total: 0,
    }),
  });

  const columns: DataGridColumn<Account>[] = [
    {
      accessorKey: "code",
      header: "Счет",
      size: 100,
      meta: { canHide: false },
      cell: ({ row }) => (
        <span className="font-mono font-semibold">{row.original.code}</span>
      ),
    },
    {
      accessorKey: "name",
      header: "Наименование",
      size: 380,
      meta: { canHide: false },
      cell: ({ row }) => (
        <span className={row.original.parent ? "pl-4 text-sm" : "font-medium"}>
          {row.original.name}
        </span>
      ),
    },
    {
      accessorKey: "type",
      header: "Вид",
      size: 160,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {TYPE_LABELS[row.original.type] ?? row.original.type}
        </span>
      ),
    },
    {
      accessorKey: "category",
      header: "Раздел",
      size: 120,
      cell: ({ row }) => (
        <Badge variant={CATEGORY_COLORS[row.original.category] ?? "outline"}>
          {CATEGORY_LABELS[row.original.category] ?? row.original.category}
        </Badge>
      ),
    },
    {
      accessorKey: "isSystem",
      header: "Тип",
      size: 100,
      cell: ({ row }) => (
        <Badge variant={row.original.isSystem ? "secondary" : "outline"}>
          {row.original.isSystem ? "Системный" : "Пользов."}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="План счетов"
        description="Рабочий план счетов бухгалтерского учёта (Приказ МФ №94н)"
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Счета ({grid.data.length})</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIncludeInactive(!includeInactive)}
          >
            {includeInactive ? "Скрыть неактивные" : "Показать неактивные"}
          </Button>
        </CardHeader>
        <CardContent>
          <DataGrid
            {...grid.gridProps}
            columns={columns}
            emptyMessage="Нет счетов"
            persistenceKey="chart-of-accounts"
            stickyHeader={false}
          />
        </CardContent>
      </Card>
    </div>
  );
}
