"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "antd";
import { ERPTable } from "@/components/erp/erp-table";
import type { ERPColumn } from "@/components/erp/erp-table.types";
import { formatRub } from "@/lib/shared/utils";
import { toast } from "sonner";

interface Balance {
  id: string;
  counterpartyId: string;
  balanceRub: number;
  counterparty: { id: string; name: string; type: string };
}

interface BalancesReport {
  balances: Balance[];
  receivable: Balance[];
  payable: Balance[];
  totalReceivable: number;
  totalPayable: number;
  netBalance: number;
}

export default function BalancesPage() {
  const [balances, setBalances] = useState<BalancesReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetch("/api/finance/reports/balances").then((res) => res.json());
      setBalances(data);
    } catch {
      toast.error("Ошибка загрузки балансов");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Взаиморасчёты" />
        <div className="py-8 text-center text-muted-foreground">Загрузка...</div>
      </div>
    );
  }

  if (!balances) {
    return (
      <div className="space-y-6">
        <PageHeader title="Взаиморасчёты" />
        <div className="py-8 text-center text-muted-foreground">Нет данных</div>
      </div>
    );
  }

  const receivableColumns: ERPColumn<Balance>[] = [
    { key: "counterparty", dataIndex: "counterparty", title: "Контрагент", render: (_, row) => row.counterparty?.name },
    {
      key: "balance",
      dataIndex: "balanceRub",
      title: "Сумма",
      align: "right",
      render: (value) => <span className="text-green-600">{formatRub(value as number)}</span>,
    },
  ];

  const payableColumns: ERPColumn<Balance>[] = [
    { key: "counterparty", dataIndex: "counterparty", title: "Контрагент", render: (_, row) => row.counterparty?.name },
    {
      key: "balance",
      dataIndex: "balanceRub",
      title: "Сумма",
      align: "right",
      render: (value) => <span className="text-red-600">{formatRub(Math.abs(value as number))}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Взаиморасчёты" />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card title={<span className="text-sm text-muted-foreground">Дебиторская задолженность</span>}>
          <p className="text-2xl font-bold text-green-600">{formatRub(balances.totalReceivable)}</p>
        </Card>
        <Card title={<span className="text-sm text-muted-foreground">Кредиторская задолженность</span>}>
          <p className="text-2xl font-bold text-red-600">{formatRub(Math.abs(balances.totalPayable))}</p>
        </Card>
        <Card title={<span className="text-sm text-muted-foreground">Чистый баланс</span>}>
          <p className={`text-2xl font-bold ${balances.netBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
            {formatRub(balances.netBalance)}
          </p>
        </Card>
      </div>

      {/* Receivable Table */}
      {balances.receivable.length > 0 && (
        <Card title={<span className="text-lg">Нам должны</span>}>
          <ERPTable
            data={balances.receivable}
            columns={receivableColumns}
            rowKey="id"
            onRefresh={load}
          />
        </Card>
      )}

      {/* Payable Table */}
      {balances.payable.length > 0 && (
        <Card title={<span className="text-lg">Мы должны</span>}>
          <ERPTable
            data={balances.payable}
            columns={payableColumns}
            rowKey="id"
            onRefresh={load}
          />
        </Card>
      )}

      {balances.receivable.length === 0 && balances.payable.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          Нет данных о взаиморасчётах
        </Card>
      )}
    </div>
  );
}
