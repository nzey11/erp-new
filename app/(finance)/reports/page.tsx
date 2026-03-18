"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatRub, formatDate } from "@/lib/shared/utils";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

// ─── API response types (matching actual API shapes) ──────────────────────────

interface ProfitLoss {
  dateFrom: string;
  dateTo: string;
  revenue: number;
  vatOnSales: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  sellingExpenses: number;
  operatingProfit: number;
  otherIncome: number;
  otherExpenses: number;
  profitBeforeTax: number;
  incomeTax: number;
  netProfit: number;
  netMarginPct: number;
}

interface CashFlow {
  dateFrom: string;
  dateTo: string;
  openingBalance: number;
  closingBalance: number;
  inflows: { cash: number; bank: number; forex: number; total: number };
  outflows: { cash: number; bank: number; forex: number; total: number };
  netCashFlow: number;
  balanced: boolean;
}

interface BalanceSheet {
  asOfDate: string;
  assets: {
    nonCurrent: { fixedAssets: number; intangibleAssets: number; total: number };
    current: {
      inventory: number;
      receivables: number;
      vatReceivable: number;
      cash: number;
      otherCurrentAssets: number;
      total: number;
    };
    total: number;
  };
  liabilities: {
    nonCurrent: { longTermDebt: number; total: number };
    current: {
      payables: number;
      customerAdvances: number;
      shortTermDebt: number;
      taxPayable: number;
      total: number;
    };
    total: number;
  };
  equity: {
    shareCapital: number;
    additionalCapital: number;
    reserveCapital: number;
    retainedEarnings: number;
    total: number;
  };
  totalPassive: number;
  balanced: boolean;
}

// ─── Drill-down types ─────────────────────────────────────────────────────────

interface DrillDownDocument {
  id: string;
  number: string;
  type: string;
  date: string;
  amount: number;
  counterparty: string | null;
  warehouse: string | null;
  status: string;
  isPayment?: false;
}

interface DrillDownPayment {
  id: string;
  number: string;
  type: string;
  date: string;
  amount: number;
  counterparty: string | null;
  category: string;
  linkedDocument: { id: string; number: string } | null;
  isPayment: true;
}

interface DrillDownBalance {
  id: string;
  number: string;
  type: string;
  date: string;
  amount: number;
  counterparty: string;
  counterpartyType: string;
  isBalance: boolean;
}

interface DrillDownResult {
  documents: DrillDownDocument[];
  payments: DrillDownPayment[];
  balances?: DrillDownBalance[];
  category: string;
  truncated?: boolean;
  message?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  grossRevenue: "Выручка от продаж",
  customerReturns: "Возвраты покупателей",
  cogs: "Себестоимость продаж",
  supplierReturns: "Возвраты поставщикам",
  sellingExpenses: "Коммерческие расходы",
  "operating.in": "Поступления (операционная деятельность)",
  "operating.out": "Выплаты (операционная деятельность)",
  "assets.receivables": "Дебиторская задолженность",
  "liabilities.payables": "Кредиторская задолженность",
  "assets.stock.incoming": "Приход товаров",
  "assets.stock.outgoing": "Расход товаров",
};

// ─── Drill-down Dialog ────────────────────────────────────────────────────────

interface DrillDownDialogProps {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  data: DrillDownResult | null;
}

function DrillDownDialog({ open, onClose, loading, data }: DrillDownDialogProps) {
  const title = data ? (CATEGORY_LABELS[data.category] ?? data.category) : "Детализация";

  const allItems: Array<{
    id: string;
    date: string;
    label: string;
    amount: number;
    counterparty: string | null;
    extra: string;
  }> = [];

  if (data) {
    for (const doc of data.documents) {
      allItems.push({
        id: doc.id,
        date: doc.date,
        label: `${doc.type} №${doc.number}`,
        amount: doc.amount,
        counterparty: doc.counterparty,
        extra: doc.warehouse ?? doc.status,
      });
    }
    for (const pay of data.payments) {
      allItems.push({
        id: pay.id,
        date: pay.date,
        label: `Платёж №${pay.number}`,
        amount: pay.amount,
        counterparty: pay.counterparty,
        extra: pay.category,
      });
    }
    for (const bal of data.balances ?? []) {
      allItems.push({
        id: bal.id,
        date: bal.date,
        label: bal.counterparty,
        amount: bal.amount,
        counterparty: bal.counterparty,
        extra: bal.counterpartyType,
      });
    }
  }

  const total = allItems.reduce((s, i) => s + i.amount, 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Загрузка данных...</span>
          </div>
        ) : data ? (
          <div className="flex-1 overflow-auto space-y-3">
            {data.message && (
              <p className="text-sm text-muted-foreground px-1">{data.message}</p>
            )}
            {data.truncated && (
              <Badge variant="secondary" className="text-xs">
                Показаны первые 500 записей
              </Badge>
            )}

            {allItems.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                Нет данных за выбранный период
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Документ / Операция</TableHead>
                    <TableHead>Контрагент</TableHead>
                    <TableHead>Примечание</TableHead>
                    <TableHead className="text-right">Сумма</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(item.date)}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{item.label}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.counterparty ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.extra}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatRub(item.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold bg-muted/30">
                    <TableCell colSpan={4}>Итого</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatRub(total)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </div>
        ) : (
          <div className="py-12 text-center text-muted-foreground">Нет данных</div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [reportTab, setReportTab] = useState("pnl");

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(
    () => new Date().toISOString().split("T")[0]
  );
  const [asOfDate, setAsOfDate] = useState(
    () => new Date().toISOString().split("T")[0]
  );

  const [profitLoss, setProfitLoss] = useState<ProfitLoss | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlow | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheet | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);

  // Drill-down state
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillData, setDrillData] = useState<DrillDownResult | null>(null);

  // ── Load report data ──────────────────────────────────────────────────────

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo });

      if (reportTab === "cashflow") {
        const res = await fetch(`/api/finance/reports/cash-flow?${params}`);
        if (res.ok) setCashFlow(await res.json());
        else toast.error("Ошибка загрузки отчёта о движении ДС");
      }
      if (reportTab === "pnl") {
        const res = await fetch(`/api/finance/reports/profit-loss?${params}`);
        if (res.ok) setProfitLoss(await res.json());
        else toast.error("Ошибка загрузки отчёта о прибылях и убытках");
      }
      if (reportTab === "balance") {
        const res = await fetch(
          `/api/finance/reports/balance-sheet?asOfDate=${asOfDate}`
        );
        if (res.ok) setBalanceSheet(await res.json());
        else toast.error("Ошибка загрузки бухгалтерского баланса");
      }
    } catch {
      toast.error("Ошибка загрузки отчётов");
    } finally {
      setReportsLoading(false);
    }
  }, [reportTab, dateFrom, dateTo, asOfDate]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // ── Drill-down opener ─────────────────────────────────────────────────────

  const openDrillDown = useCallback(
    async (category: string, asOf?: string) => {
      setDrillData(null);
      setDrillOpen(true);
      setDrillLoading(true);
      try {
        const params = new URLSearchParams({ category });
        if (asOf) {
          params.set("asOfDate", asOf);
        } else {
          params.set("dateFrom", dateFrom);
          params.set("dateTo", dateTo);
        }
        const res = await fetch(`/api/finance/reports/drill-down?${params}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Ошибка" }));
          toast.error(err.error ?? "Ошибка загрузки детализации");
          setDrillOpen(false);
          return;
        }
        setDrillData(await res.json());
      } catch {
        toast.error("Ошибка загрузки детализации");
        setDrillOpen(false);
      } finally {
        setDrillLoading(false);
      }
    },
    [dateFrom, dateTo]
  );

  // ── Clickable row helper ──────────────────────────────────────────────────

  const drillRowProps = (category: string, asOf?: string) => ({
    className:
      "cursor-pointer hover:bg-accent/50 transition-colors",
    onClick: () => openDrillDown(category, asOf),
    title: "Нажмите для детализации",
  });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader title="Отчёты" />

      <DrillDownDialog
        open={drillOpen}
        onClose={() => setDrillOpen(false)}
        loading={drillLoading}
        data={drillData}
      />

      <Tabs value={reportTab} onValueChange={setReportTab}>
        <TabsList>
          <TabsTrigger value="pnl">Прибыли и убытки</TabsTrigger>
          <TabsTrigger value="cashflow">Денежный поток</TabsTrigger>
          <TabsTrigger value="balance">Баланс</TabsTrigger>
        </TabsList>

        {/* ── P&L Tab ────────────────────────────────────────────────────── */}
        <TabsContent value="pnl">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Label>С</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label>По</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-40"
              />
            </div>
            <Button variant="outline" size="sm" onClick={loadReports}>
              Обновить
            </Button>
          </div>

          {reportsLoading ? (
            <div className="py-8 text-center text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загрузка...
            </div>
          ) : profitLoss ? (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">
                      Выручка (нетто)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">
                      {formatRub(profitLoss.netRevenue)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">
                      Валовая прибыль
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p
                      className={`text-2xl font-bold ${profitLoss.grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {formatRub(profitLoss.grossProfit)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Маржа: {profitLoss.grossMarginPct.toFixed(1)}%
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">
                      Операционная прибыль
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p
                      className={`text-2xl font-bold ${profitLoss.operatingProfit >= 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {formatRub(profitLoss.operatingProfit)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">
                      Чистая прибыль
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p
                      className={`text-2xl font-bold ${profitLoss.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {formatRub(profitLoss.netProfit)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Маржа: {profitLoss.netMarginPct.toFixed(1)}%
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Detailed P&L Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Отчёт о прибылях и убытках</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Нажмите на строку для детализации
                  </p>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableBody>
                      {/* Revenue */}
                      <TableRow className="bg-muted/50 pointer-events-none">
                        <TableCell className="font-bold">ВЫРУЧКА</TableCell>
                        <TableCell />
                      </TableRow>
                      <TableRow {...drillRowProps("grossRevenue")}>
                        <TableCell className="pl-6">Выручка от продаж (90.1)</TableCell>
                        <TableCell className="text-right">{formatRub(profitLoss.revenue)}</TableCell>
                      </TableRow>
                      <TableRow className="pointer-events-none">
                        <TableCell className="pl-6 text-muted-foreground">
                          НДС начисленный (90.3)
                        </TableCell>
                        <TableCell className="text-right text-red-600">
                          -{formatRub(profitLoss.vatOnSales)}
                        </TableCell>
                      </TableRow>
                      <TableRow className="font-medium pointer-events-none">
                        <TableCell>Чистая выручка</TableCell>
                        <TableCell className="text-right font-bold">
                          {formatRub(profitLoss.netRevenue)}
                        </TableCell>
                      </TableRow>

                      {/* COGS */}
                      <TableRow className="bg-muted/50 pointer-events-none">
                        <TableCell className="font-bold">СЕБЕСТОИМОСТЬ</TableCell>
                        <TableCell />
                      </TableRow>
                      <TableRow {...drillRowProps("cogs")}>
                        <TableCell className="pl-6">Себестоимость продаж (90.2)</TableCell>
                        <TableCell className="text-right text-red-600">
                          {formatRub(profitLoss.cogs)}
                        </TableCell>
                      </TableRow>
                      <TableRow className="font-medium pointer-events-none">
                        <TableCell>Валовая прибыль</TableCell>
                        <TableCell
                          className={`text-right font-bold ${profitLoss.grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}
                        >
                          {formatRub(profitLoss.grossProfit)}
                        </TableCell>
                      </TableRow>

                      {/* Operating */}
                      <TableRow className="bg-muted/50 pointer-events-none">
                        <TableCell className="font-bold">ОПЕРАЦИОННЫЕ РАСХОДЫ</TableCell>
                        <TableCell />
                      </TableRow>
                      <TableRow {...drillRowProps("sellingExpenses")}>
                        <TableCell className="pl-6">
                          Коммерческие и управленческие расходы (44)
                        </TableCell>
                        <TableCell className="text-right text-red-600">
                          {formatRub(profitLoss.sellingExpenses)}
                        </TableCell>
                      </TableRow>
                      <TableRow
                        className={`font-medium pointer-events-none`}
                      >
                        <TableCell>Операционная прибыль</TableCell>
                        <TableCell
                          className={`text-right font-bold ${profitLoss.operatingProfit >= 0 ? "text-green-600" : "text-red-600"}`}
                        >
                          {formatRub(profitLoss.operatingProfit)}
                        </TableCell>
                      </TableRow>

                      {/* Other */}
                      <TableRow className="bg-muted/50 pointer-events-none">
                        <TableCell className="font-bold">ПРОЧИЕ ДОХОДЫ И РАСХОДЫ</TableCell>
                        <TableCell />
                      </TableRow>
                      <TableRow className="pointer-events-none">
                        <TableCell className="pl-6">Прочие доходы (91.1)</TableCell>
                        <TableCell className="text-right text-green-600">
                          +{formatRub(profitLoss.otherIncome)}
                        </TableCell>
                      </TableRow>
                      <TableRow className="pointer-events-none">
                        <TableCell className="pl-6">Прочие расходы (91.2)</TableCell>
                        <TableCell className="text-right text-red-600">
                          -{formatRub(profitLoss.otherExpenses)}
                        </TableCell>
                      </TableRow>
                      <TableRow className="font-medium pointer-events-none">
                        <TableCell>Прибыль до налогообложения</TableCell>
                        <TableCell
                          className={`text-right font-bold ${profitLoss.profitBeforeTax >= 0 ? "text-green-600" : "text-red-600"}`}
                        >
                          {formatRub(profitLoss.profitBeforeTax)}
                        </TableCell>
                      </TableRow>
                      <TableRow className="pointer-events-none">
                        <TableCell className="pl-6">Налог на прибыль (68.04)</TableCell>
                        <TableCell className="text-right text-red-600">
                          -{formatRub(profitLoss.incomeTax)}
                        </TableCell>
                      </TableRow>

                      {/* Net */}
                      <TableRow className="bg-primary/10 pointer-events-none">
                        <TableCell className="font-bold text-lg">ЧИСТАЯ ПРИБЫЛЬ</TableCell>
                        <TableCell
                          className={`text-right font-bold text-lg ${profitLoss.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}
                        >
                          {formatRub(profitLoss.netProfit)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">Нет данных</div>
          )}
        </TabsContent>

        {/* ── Cash Flow Tab ──────────────────────────────────────────────── */}
        <TabsContent value="cashflow">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Label>С</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label>По</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-40"
              />
            </div>
            <Button variant="outline" size="sm" onClick={loadReports}>
              Обновить
            </Button>
          </div>

          {reportsLoading ? (
            <div className="py-8 text-center text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загрузка...
            </div>
          ) : cashFlow ? (
            <div className="space-y-4">
              {!cashFlow.balanced && (
                <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded px-3 py-2">
                  ⚠️ Баланс не сходится: остаток на конец ≠ остаток на начало + чистый поток
                </div>
              )}
              <Card>
                <CardHeader>
                  <CardTitle>Отчёт о движении денежных средств</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Нажмите на строку для детализации
                  </p>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableBody>
                      {/* Opening balance */}
                      <TableRow className="bg-muted/50 pointer-events-none">
                        <TableCell className="font-bold">Остаток на начало периода</TableCell>
                        <TableCell className="text-right font-bold">
                          {formatRub(cashFlow.openingBalance)}
                        </TableCell>
                      </TableRow>

                      {/* Cash inflows */}
                      <TableRow className="bg-muted/30 pointer-events-none">
                        <TableCell className="font-bold">Поступления денежных средств</TableCell>
                        <TableCell />
                      </TableRow>
                      <TableRow {...drillRowProps("operating.in")}>
                        <TableCell className="pl-6">
                          Расчётный счёт — поступления (Дт 51)
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          +{formatRub(cashFlow.inflows.bank)}
                        </TableCell>
                      </TableRow>
                      {cashFlow.inflows.cash > 0 && (
                        <TableRow {...drillRowProps("operating.in")}>
                          <TableCell className="pl-6">Касса — поступления (Дт 50)</TableCell>
                          <TableCell className="text-right text-green-600">
                            +{formatRub(cashFlow.inflows.cash)}
                          </TableCell>
                        </TableRow>
                      )}
                      {cashFlow.inflows.forex > 0 && (
                        <TableRow {...drillRowProps("operating.in")}>
                          <TableCell className="pl-6">
                            Валютный счёт — поступления (Дт 52)
                          </TableCell>
                          <TableCell className="text-right text-green-600">
                            +{formatRub(cashFlow.inflows.forex)}
                          </TableCell>
                        </TableRow>
                      )}
                      <TableRow className="font-medium pointer-events-none">
                        <TableCell>Итого поступлений</TableCell>
                        <TableCell className="text-right font-bold text-green-600">
                          +{formatRub(cashFlow.inflows.total)}
                        </TableCell>
                      </TableRow>

                      {/* Cash outflows */}
                      <TableRow className="bg-muted/30 pointer-events-none">
                        <TableCell className="font-bold">Выплаты денежных средств</TableCell>
                        <TableCell />
                      </TableRow>
                      <TableRow {...drillRowProps("operating.out")}>
                        <TableCell className="pl-6">
                          Расчётный счёт — выплаты (Кт 51)
                        </TableCell>
                        <TableCell className="text-right text-red-600">
                          -{formatRub(cashFlow.outflows.bank)}
                        </TableCell>
                      </TableRow>
                      {cashFlow.outflows.cash > 0 && (
                        <TableRow {...drillRowProps("operating.out")}>
                          <TableCell className="pl-6">Касса — выплаты (Кт 50)</TableCell>
                          <TableCell className="text-right text-red-600">
                            -{formatRub(cashFlow.outflows.cash)}
                          </TableCell>
                        </TableRow>
                      )}
                      {cashFlow.outflows.forex > 0 && (
                        <TableRow {...drillRowProps("operating.out")}>
                          <TableCell className="pl-6">
                            Валютный счёт — выплаты (Кт 52)
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            -{formatRub(cashFlow.outflows.forex)}
                          </TableCell>
                        </TableRow>
                      )}
                      <TableRow className="font-medium pointer-events-none">
                        <TableCell>Итого выплат</TableCell>
                        <TableCell className="text-right font-bold text-red-600">
                          -{formatRub(cashFlow.outflows.total)}
                        </TableCell>
                      </TableRow>

                      {/* Net & closing */}
                      <TableRow
                        className={`font-bold bg-muted/50 pointer-events-none`}
                      >
                        <TableCell>Чистый денежный поток</TableCell>
                        <TableCell
                          className={`text-right ${cashFlow.netCashFlow >= 0 ? "text-green-600" : "text-red-600"}`}
                        >
                          {formatRub(cashFlow.netCashFlow)}
                        </TableCell>
                      </TableRow>
                      <TableRow className="bg-primary/10 pointer-events-none">
                        <TableCell className="font-bold text-lg">
                          Остаток на конец периода
                        </TableCell>
                        <TableCell className="text-right font-bold text-lg">
                          {formatRub(cashFlow.closingBalance)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">Нет данных</div>
          )}
        </TabsContent>

        {/* ── Balance Sheet Tab ──────────────────────────────────────────── */}
        <TabsContent value="balance">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Label>На дату</Label>
              <Input
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="w-40"
              />
            </div>
            <Button variant="outline" size="sm" onClick={loadReports}>
              Обновить
            </Button>
            {balanceSheet && !balanceSheet.balanced && (
              <span className="text-red-500 text-sm">⚠️ Баланс не сходится!</span>
            )}
          </div>

          {reportsLoading ? (
            <div className="py-8 text-center text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загрузка...
            </div>
          ) : balanceSheet ? (
            <div className="grid gap-4 md:grid-cols-2">
              {/* АКТИВ */}
              <Card>
                <CardHeader>
                  <CardTitle>АКТИВ</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Нажмите на строку для детализации
                  </p>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableBody>
                      {/* Non-current */}
                      <TableRow className="bg-muted/30 pointer-events-none">
                        <TableCell className="font-bold">Внеоборотные активы</TableCell>
                        <TableCell />
                      </TableRow>
                      <TableRow className="pointer-events-none">
                        <TableCell className="pl-6">Основные средства (01–02)</TableCell>
                        <TableCell className="text-right">
                          {formatRub(balanceSheet.assets.nonCurrent.fixedAssets)}
                        </TableCell>
                      </TableRow>
                      <TableRow className="pointer-events-none">
                        <TableCell className="pl-6">Нематериальные активы (04–05)</TableCell>
                        <TableCell className="text-right">
                          {formatRub(balanceSheet.assets.nonCurrent.intangibleAssets)}
                        </TableCell>
                      </TableRow>
                      <TableRow className="font-medium pointer-events-none">
                        <TableCell>Итого внеоборотные</TableCell>
                        <TableCell className="text-right font-bold">
                          {formatRub(balanceSheet.assets.nonCurrent.total)}
                        </TableCell>
                      </TableRow>

                      {/* Current */}
                      <TableRow className="bg-muted/30 pointer-events-none">
                        <TableCell className="font-bold">Оборотные активы</TableCell>
                        <TableCell />
                      </TableRow>
                      <TableRow {...drillRowProps("assets.stock.incoming", asOfDate)}>
                        <TableCell className="pl-6">Товарные запасы (41)</TableCell>
                        <TableCell className="text-right">
                          {formatRub(balanceSheet.assets.current.inventory)}
                        </TableCell>
                      </TableRow>
                      <TableRow {...drillRowProps("assets.receivables", asOfDate)}>
                        <TableCell className="pl-6">
                          Дебиторская задолженность (62 Дт)
                        </TableCell>
                        <TableCell className="text-right">
                          {formatRub(balanceSheet.assets.current.receivables)}
                        </TableCell>
                      </TableRow>
                      <TableRow className="pointer-events-none">
                        <TableCell className="pl-6">НДС к возмещению (19)</TableCell>
                        <TableCell className="text-right">
                          {formatRub(balanceSheet.assets.current.vatReceivable)}
                        </TableCell>
                      </TableRow>
                      <TableRow className="pointer-events-none">
                        <TableCell className="pl-6">Денежные средства (50+51+52)</TableCell>
                        <TableCell className="text-right">
                          {formatRub(balanceSheet.assets.current.cash)}
                        </TableCell>
                      </TableRow>
                      {balanceSheet.assets.current.otherCurrentAssets > 0 && (
                        <TableRow className="pointer-events-none">
                          <TableCell className="pl-6">Прочие оборотные (57)</TableCell>
                          <TableCell className="text-right">
                            {formatRub(balanceSheet.assets.current.otherCurrentAssets)}
                          </TableCell>
                        </TableRow>
                      )}
                      <TableRow className="font-medium pointer-events-none">
                        <TableCell>Итого оборотные</TableCell>
                        <TableCell className="text-right font-bold">
                          {formatRub(balanceSheet.assets.current.total)}
                        </TableCell>
                      </TableRow>

                      <TableRow className="bg-primary/10 pointer-events-none">
                        <TableCell className="font-bold text-lg">ВСЕГО АКТИВ</TableCell>
                        <TableCell className="text-right font-bold text-lg">
                          {formatRub(balanceSheet.assets.total)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* ПАССИВ */}
              <Card>
                <CardHeader>
                  <CardTitle>ПАССИВ</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Нажмите на строку для детализации
                  </p>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableBody>
                      {/* Equity */}
                      <TableRow className="bg-muted/30 pointer-events-none">
                        <TableCell className="font-bold">Капитал и резервы</TableCell>
                        <TableCell />
                      </TableRow>
                      <TableRow className="pointer-events-none">
                        <TableCell className="pl-6">Уставный капитал (80)</TableCell>
                        <TableCell className="text-right">
                          {formatRub(balanceSheet.equity.shareCapital)}
                        </TableCell>
                      </TableRow>
                      {balanceSheet.equity.additionalCapital > 0 && (
                        <TableRow className="pointer-events-none">
                          <TableCell className="pl-6">Добавочный капитал (83)</TableCell>
                          <TableCell className="text-right">
                            {formatRub(balanceSheet.equity.additionalCapital)}
                          </TableCell>
                        </TableRow>
                      )}
                      {balanceSheet.equity.reserveCapital > 0 && (
                        <TableRow className="pointer-events-none">
                          <TableCell className="pl-6">Резервный капитал (82)</TableCell>
                          <TableCell className="text-right">
                            {formatRub(balanceSheet.equity.reserveCapital)}
                          </TableCell>
                        </TableRow>
                      )}
                      <TableRow className="pointer-events-none">
                        <TableCell className="pl-6">Нераспределённая прибыль (84+99)</TableCell>
                        <TableCell className="text-right">
                          {formatRub(balanceSheet.equity.retainedEarnings)}
                        </TableCell>
                      </TableRow>
                      <TableRow className="font-medium pointer-events-none">
                        <TableCell>Итого капитал</TableCell>
                        <TableCell className="text-right font-bold">
                          {formatRub(balanceSheet.equity.total)}
                        </TableCell>
                      </TableRow>

                      {/* Long-term liabilities */}
                      <TableRow className="bg-muted/30 pointer-events-none">
                        <TableCell className="font-bold">Долгосрочные обязательства</TableCell>
                        <TableCell />
                      </TableRow>
                      <TableRow className="pointer-events-none">
                        <TableCell className="pl-6">Долгосрочные займы (67)</TableCell>
                        <TableCell className="text-right">
                          {formatRub(balanceSheet.liabilities.nonCurrent.longTermDebt)}
                        </TableCell>
                      </TableRow>
                      <TableRow className="font-medium pointer-events-none">
                        <TableCell>Итого долгосрочные</TableCell>
                        <TableCell className="text-right font-bold">
                          {formatRub(balanceSheet.liabilities.nonCurrent.total)}
                        </TableCell>
                      </TableRow>

                      {/* Short-term liabilities */}
                      <TableRow className="bg-muted/30 pointer-events-none">
                        <TableCell className="font-bold">Краткосрочные обязательства</TableCell>
                        <TableCell />
                      </TableRow>
                      <TableRow {...drillRowProps("liabilities.payables", asOfDate)}>
                        <TableCell className="pl-6">
                          Кредиторская задолженность (60 Кт)
                        </TableCell>
                        <TableCell className="text-right">
                          {formatRub(balanceSheet.liabilities.current.payables)}
                        </TableCell>
                      </TableRow>
                      {balanceSheet.liabilities.current.customerAdvances > 0 && (
                        <TableRow className="pointer-events-none">
                          <TableCell className="pl-6">Авансы покупателей (62 Кт)</TableCell>
                          <TableCell className="text-right">
                            {formatRub(balanceSheet.liabilities.current.customerAdvances)}
                          </TableCell>
                        </TableRow>
                      )}
                      {balanceSheet.liabilities.current.shortTermDebt > 0 && (
                        <TableRow className="pointer-events-none">
                          <TableCell className="pl-6">Краткосрочные кредиты (66)</TableCell>
                          <TableCell className="text-right">
                            {formatRub(balanceSheet.liabilities.current.shortTermDebt)}
                          </TableCell>
                        </TableRow>
                      )}
                      {balanceSheet.liabilities.current.taxPayable > 0 && (
                        <TableRow className="pointer-events-none">
                          <TableCell className="pl-6">Налоги к уплате (68)</TableCell>
                          <TableCell className="text-right">
                            {formatRub(balanceSheet.liabilities.current.taxPayable)}
                          </TableCell>
                        </TableRow>
                      )}
                      <TableRow className="font-medium pointer-events-none">
                        <TableCell>Итого краткосрочные</TableCell>
                        <TableCell className="text-right font-bold">
                          {formatRub(balanceSheet.liabilities.current.total)}
                        </TableCell>
                      </TableRow>

                      <TableRow className="bg-muted/50 pointer-events-none">
                        <TableCell className="font-bold">ИТОГО ОБЯЗАТЕЛЬСТВА</TableCell>
                        <TableCell className="text-right font-bold">
                          {formatRub(balanceSheet.liabilities.total)}
                        </TableCell>
                      </TableRow>

                      <TableRow className="bg-primary/10 pointer-events-none">
                        <TableCell className="font-bold text-lg">ВСЕГО ПАССИВ</TableCell>
                        <TableCell className="text-right font-bold text-lg">
                          {formatRub(balanceSheet.totalPassive)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">Нет данных</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
