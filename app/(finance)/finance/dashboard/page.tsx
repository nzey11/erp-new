"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatRub } from "@/lib/shared/utils";
import { TrendingUp, TrendingDown, Wallet, Users, Banknote, Calendar } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

const PERIOD_OPTIONS = [
  { label: "Этот месяц", days: 0, currentMonth: true },
  { label: "7 дней", days: 7 },
  { label: "30 дней", days: 30 },
  { label: "90 дней", days: 90 },
];

function getPeriodDates(opt: typeof PERIOD_OPTIONS[number]) {
  const dateTo = new Date();
  let dateFrom: Date;
  if (opt.currentMonth) {
    dateFrom = new Date(dateTo.getFullYear(), dateTo.getMonth(), 1);
  } else {
    dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - opt.days);
  }
  return {
    dateFrom: dateFrom.toISOString().split("T")[0],
    dateTo: dateTo.toISOString().split("T")[0],
  };
}

interface CashFlow {
  inflows: { total: number; cash: number; bank: number };
  outflows: { total: number; cash: number; bank: number };
  netCashFlow: number;
  closingBalance: number;
  openingBalance: number;
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
  const [selectedPeriod, setSelectedPeriod] = useState(0); // index into PERIOD_OPTIONS

  useEffect(() => {
    const opt = PERIOD_OPTIONS[selectedPeriod];
    const { dateFrom, dateTo } = getPeriodDates(opt);
    const params = new URLSearchParams({ dateFrom, dateTo });

    const fetchData = async () => {
      setLoading(true);
      try {
        const [cf, bal] = await Promise.all([
          fetch(`/api/finance/reports/cash-flow?${params}`).then((r) => r.json()),
          fetch("/api/finance/reports/balances").then((r) => r.json()),
        ]);
        setCashFlow(cf?.inflows ? cf : null);
        setBalances(bal?.netBalance !== undefined ? bal : null);
      } catch {
        toast.error("Ошибка загрузки данных");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedPeriod]);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Дашборд" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
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
      <PageHeader title="Дашборд" />

      {/* Period Selector */}
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Период:</span>
        {PERIOD_OPTIONS.map((opt, i) => (
          <Button
            key={i}
            variant={selectedPeriod === i ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedPeriod(i)}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {/* Cash Balance — #1 KPI for a CFO */}
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Banknote className="h-4 w-4 text-primary" />
              Остаток денег (Касса+Счёт)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${cashFlow && cashFlow.closingBalance >= 0 ? "text-primary" : "text-red-600"}`}>
              {cashFlow ? formatRub(cashFlow.closingBalance) : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">счета 50+51+52</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              Поступления
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {cashFlow?.inflows ? formatRub(cashFlow.inflows.total) : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{PERIOD_OPTIONS[selectedPeriod].label}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              Выплаты
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">
              {cashFlow?.outflows ? formatRub(cashFlow.outflows.total) : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{PERIOD_OPTIONS[selectedPeriod].label}</p>
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
            <p className="text-xs text-muted-foreground mt-1">{PERIOD_OPTIONS[selectedPeriod].label}</p>
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
            <p className="text-xs text-muted-foreground mt-1">дебиторская − кредиторская</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="hover:border-primary/40 transition-colors cursor-pointer">
          <Link href="/finance/payments">
            <CardHeader className="pb-2"><CardTitle className="text-base">Платежи</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">Зарегистрировать доходы и расходы, фильтровать по периоду и контрагенту.</CardContent>
          </Link>
        </Card>
        <Card className="hover:border-primary/40 transition-colors cursor-pointer">
          <Link href="/finance/reports">
            <CardHeader className="pb-2"><CardTitle className="text-base">Отчёты</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">Прибыли и убытки, ДДС, Баланс активов и пассивов. Детализация по клику.</CardContent>
          </Link>
        </Card>
        <Card className="hover:border-primary/40 transition-colors cursor-pointer">
          <Link href="/finance/balances">
            <CardHeader className="pb-2"><CardTitle className="text-base">Взаиморасчёты</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">Дебиторская и кредиторская задолженность по каждому контрагенту.</CardContent>
          </Link>
        </Card>
      </div>
    </div>
  );
}
