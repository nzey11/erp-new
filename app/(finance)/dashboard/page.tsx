"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRub } from "@/lib/shared/utils";
import { TrendingUp, TrendingDown, Wallet, Users } from "lucide-react";
import { toast } from "sonner";

interface CashFlow {
  cashIn: number;
  cashOut: number;
  netCashFlow: number;
}

interface BalancesReport {
  totalReceivable: number;
  totalPayable: number;
  netBalance: number;
}

export default function FinanceDashboardPage() {
  const [cashFlow, setCashFlow] = useState<CashFlow | null>(null);
  const [balances, setBalances] = useState<BalancesReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const dateFrom = new Date();
    dateFrom.setMonth(dateFrom.getMonth() - 1);
    const dateTo = new Date();
    const params = new URLSearchParams({
      dateFrom: dateFrom.toISOString().split("T")[0],
      dateTo: dateTo.toISOString().split("T")[0],
    });

    Promise.all([
      fetch(`/api/finance/reports/cash-flow?${params}`).then((r) => r.json()),
      fetch("/api/finance/reports/balances").then((r) => r.json()),
    ])
      .then(([cf, bal]) => {
        setCashFlow(cf);
        setBalances(bal);
      })
      .catch(() => {
        toast.error("Ошибка загрузки данных");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Финансы - Дашборд" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-muted rounded w-24"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-32"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Финансы - Дашборд" />

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              Поступления (мес)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {cashFlow ? formatRub(cashFlow.cashIn) : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              Выплаты (мес)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">
              {cashFlow ? formatRub(cashFlow.cashOut) : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4 text-blue-500" />
              Чистый поток
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${cashFlow && cashFlow.netCashFlow >= 0 ? "text-green-600" : "text-red-600"}`}>
              {cashFlow ? formatRub(cashFlow.netCashFlow) : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-500" />
              Баланс с контрагентами
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${balances && balances.netBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
              {balances ? formatRub(balances.netBalance) : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Placeholder for future charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="h-64 flex items-center justify-center text-muted-foreground">
          <p>График денежного потока (в разработке)</p>
        </Card>
        <Card className="h-64 flex items-center justify-center text-muted-foreground">
          <p>Структура расходов (в разработке)</p>
        </Card>
      </div>
    </div>
  );
}
