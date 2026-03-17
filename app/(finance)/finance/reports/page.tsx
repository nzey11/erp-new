"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";
import { formatRub, formatDate } from "@/lib/shared/utils";
import { toast } from "sonner";

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
    current: { cash: number; receivables: number; inventory: number; vatReceivable: number; otherCurrentAssets: number; total: number };
    nonCurrent: { fixedAssets: number; intangibleAssets: number; total: number };
    total: number;
  };
  liabilities: {
    current: { payables: number; customerAdvances: number; shortTermDebt: number; taxPayable: number; total: number };
    nonCurrent: { longTermDebt: number; total: number };
    total: number;
  };
  equity: { shareCapital: number; additionalCapital: number; reserveCapital: number; retainedEarnings: number; total: number };
  totalPassive: number;
  balanced: boolean;
}

interface DrillDownItem {
  id: string;
  number: string;
  type: string;
  date: string;
  amount: number;
  counterparty?: string | null;
  warehouse?: string | null;
  status?: string;
  category?: string;
  linkedDocument?: { id: string; number: string } | null;
  isPayment?: boolean;
  isBalance?: boolean;
  counterpartyType?: string;
}

interface DrillDownResponse {
  documents: DrillDownItem[];
  payments: DrillDownItem[];
  balances?: DrillDownItem[];
  category: string;
  message?: string;
  truncated?: boolean;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  outgoing_shipment: "Отгрузка",
  customer_return: "Возврат покупателя",
  incoming_shipment: "Приёмка",
  supplier_return: "Возврат поставщику",
  incoming_payment: "Входящий платёж",
  outgoing_payment: "Исходящий платёж",
  stock_receipt: "Оприходование",
  write_off: "Списание",
  income: "Поступление",
  expense: "Расход",
  counterparty_balance: "Сальдо контрагента",
};

// Categories that have drill-down available
const DRILL_DOWN_CATEGORIES = [
  "grossRevenue", "customerReturns", "cogs", "supplierReturns", "sellingExpenses",
  "operating.in", "operating.out",
  "assets.stock.incoming", "assets.stock.outgoing", "assets.receivables", "liabilities.payables",
];

function getDefaultDateFrom() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().split("T")[0];
}

function getDefaultDateTo() {
  return new Date().toISOString().split("T")[0];
}

export default function ReportsPage() {
  const [mounted, setMounted] = useState(false);
  const [reportTab, setReportTab] = useState("pnl");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [asOfDate, setAsOfDate] = useState("");

  // Debounced versions that actually trigger the fetch (600ms delay)
  const [appliedDateFrom, setAppliedDateFrom] = useState("");
  const [appliedDateTo, setAppliedDateTo] = useState("");
  const [appliedAsOf, setAppliedAsOf] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const from = getDefaultDateFrom();
    const to = getDefaultDateTo();
    setDateFrom(from);
    setDateTo(to);
    setAsOfDate(to);
    setAppliedDateFrom(from);
    setAppliedDateTo(to);
    setAppliedAsOf(to);
    setMounted(true);
  }, []);

  const scheduleApply = (from: string, to: string, asOf: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setAppliedDateFrom(from);
      setAppliedDateTo(to);
      setAppliedAsOf(asOf);
    }, 600);
  };
  const [profitLoss, setProfitLoss] = useState<ProfitLoss | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlow | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheet | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);

  // Drill-down state
  const [drillDownOpen, setDrillDownOpen] = useState(false);
  const [drillDownCategory, setDrillDownCategory] = useState("");
  const [drillDownData, setDrillDownData] = useState<DrillDownResponse | null>(null);
  const [drillDownLoading, setDrillDownLoading] = useState(false);

  const openDrillDown = async (category: string) => {
    if (!DRILL_DOWN_CATEGORIES.includes(category)) return;
    setDrillDownCategory(category);
    setDrillDownOpen(true);
    setDrillDownLoading(true);
    setDrillDownData(null);

    try {
      const params = new URLSearchParams({ category });
      if (reportTab === "balance") {
        params.set("asOfDate", asOfDate);
      } else {
        params.set("dateFrom", dateFrom);
        params.set("dateTo", dateTo);
      }

      const res = await fetch(`/api/finance/reports/drill-down?${params}`);
      if (res.ok) {
        setDrillDownData(await res.json());
      } else {
        toast.error("Ошибка загрузки данных");
      }
    } catch {
      toast.error("Ошибка загрузки данных");
    } finally {
      setDrillDownLoading(false);
    }
  };

  const getDrillDownTitle = (category: string) => {
    const titles: Record<string, string> = {
      grossRevenue: "Выручка от продаж",
      customerReturns: "Возвраты покупателей",
      cogs: "Себестоимость продаж",
      supplierReturns: "Возвраты поставщикам",
      sellingExpenses: "Расходы на продажу (Дт 44)",
      "operating.in": "Поступления от покупателей",
      "operating.out": "Выплаты поставщикам",
      "assets.stock.incoming": "Поступление товаров",
      "assets.stock.outgoing": "Выбытие товаров",
      "assets.receivables": "Дебиторская задолженность",
      "liabilities.payables": "Кредиторская задолженность",
    };
    return titles[category] || category;
  };

  // Combine all items for display
  const getAllDrillDownItems = () => {
    if (!drillDownData) return [];
    const items = [
      ...drillDownData.documents,
      ...drillDownData.payments,
      ...(drillDownData.balances || []),
    ];
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const getTotalAmount = () => {
    return getAllDrillDownItems().reduce((sum, item) => sum + item.amount, 0);
  };

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const params = new URLSearchParams({ dateFrom: appliedDateFrom, dateTo: appliedDateTo });

      if (reportTab === "cashflow") {
        const res = await fetch(`/api/finance/reports/cash-flow?${params}`);
        if (res.ok) setCashFlow(await res.json());
      }
      if (reportTab === "pnl") {
        const res = await fetch(`/api/finance/reports/profit-loss?${params}`);
        if (res.ok) setProfitLoss(await res.json());
      }
      if (reportTab === "balance") {
        const res = await fetch(`/api/finance/reports/balance-sheet?asOfDate=${appliedAsOf}`);
        if (res.ok) setBalanceSheet(await res.json());
      }
    } catch {
      toast.error("Ошибка загрузки отчётов");
    } finally {
      setReportsLoading(false);
    }
  }, [reportTab, appliedDateFrom, appliedDateTo, appliedAsOf]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  if (!mounted) {
    return (
      <div className="space-y-6">
        <PageHeader title="Отчёты" />
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Отчёты" />

      <Tabs value={reportTab} onValueChange={setReportTab}>
        <TabsList>
          <TabsTrigger value="pnl">Прибыли и убытки</TabsTrigger>
          <TabsTrigger value="cashflow">Денежный поток</TabsTrigger>
          <TabsTrigger value="balance">Баланс</TabsTrigger>
        </TabsList>

        {/* P&L Tab */}
        <TabsContent value="pnl">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Label>С</Label>
              <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); scheduleApply(e.target.value, dateTo, asOfDate); }} className="w-40" />
            </div>
            <div className="flex items-center gap-2">
              <Label>По</Label>
              <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); scheduleApply(dateFrom, e.target.value, asOfDate); }} className="w-40" />
            </div>
          </div>

          {reportsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : profitLoss ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Выручка</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold">{formatRub(profitLoss.netRevenue)}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Валовая прибыль</CardTitle></CardHeader>
                  <CardContent>
                    <p className={`text-2xl font-bold ${profitLoss.grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatRub(profitLoss.grossProfit)}
                    </p>
                    <p className="text-xs text-muted-foreground">Маржа: {profitLoss.grossMarginPct.toFixed(1)}%</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Операц. прибыль</CardTitle></CardHeader>
                  <CardContent>
                    <p className={`text-2xl font-bold ${profitLoss.operatingProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatRub(profitLoss.operatingProfit)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Чистая прибыль</CardTitle></CardHeader>
                  <CardContent>
                    <p className={`text-2xl font-bold ${profitLoss.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatRub(profitLoss.netProfit)}
                    </p>
                    <p className="text-xs text-muted-foreground">Маржа: {profitLoss.netMarginPct.toFixed(1)}%</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader><CardTitle>Отчёт о прибылях и убытках</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableBody>
                      <TableRow className="bg-muted/50"><TableCell className="font-bold">ВЫРУЧКА</TableCell><TableCell></TableCell></TableRow>
                      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => openDrillDown("grossRevenue")}><TableCell className="pl-6">Выручка от продаж</TableCell><TableCell className="text-right">{formatRub(profitLoss.revenue)}</TableCell></TableRow>
                      {profitLoss.vatOnSales > 0 && <TableRow><TableCell className="pl-6 text-muted-foreground">НДС с продаж</TableCell><TableCell className="text-right text-red-600">-{formatRub(profitLoss.vatOnSales)}</TableCell></TableRow>}
                      <TableRow className="font-medium"><TableCell>Чистая выручка</TableCell><TableCell className="text-right font-bold">{formatRub(profitLoss.netRevenue)}</TableCell></TableRow>

                      <TableRow className="bg-muted/50"><TableCell className="font-bold">СЕБЕСТОИМОСТЬ</TableCell><TableCell></TableCell></TableRow>
                      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => openDrillDown("cogs")}><TableCell className="pl-6">Себестоимость продаж (Дт 90.2)</TableCell><TableCell className="text-right text-red-600">-{formatRub(profitLoss.cogs)}</TableCell></TableRow>
                      <TableRow className="font-medium"><TableCell>Валовая прибыль</TableCell><TableCell className={`text-right font-bold ${profitLoss.grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>{formatRub(profitLoss.grossProfit)}</TableCell></TableRow>

                      <TableRow className="bg-muted/50"><TableCell className="font-bold">ОПЕРАЦИОННЫЕ РАСХОДЫ</TableCell><TableCell></TableCell></TableRow>
                      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => openDrillDown("sellingExpenses")}><TableCell className="pl-6">Расходы на продажу (Дт 44)</TableCell><TableCell className="text-right text-red-600">-{formatRub(profitLoss.sellingExpenses)}</TableCell></TableRow>
                      <TableRow className="font-medium"><TableCell>Операционная прибыль</TableCell><TableCell className={`text-right font-bold ${profitLoss.operatingProfit >= 0 ? "text-green-600" : "text-red-600"}`}>{formatRub(profitLoss.operatingProfit)}</TableCell></TableRow>

                      <TableRow className="bg-muted/50"><TableCell className="font-bold">ПРОЧИЕ ДОХОДЫ И РАСХОДЫ</TableCell><TableCell></TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Прочие доходы (Кт 91.1)</TableCell><TableCell className="text-right text-green-600">+{formatRub(profitLoss.otherIncome)}</TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Прочие расходы (Дт 91.2)</TableCell><TableCell className="text-right text-red-600">-{formatRub(profitLoss.otherExpenses)}</TableCell></TableRow>
                      <TableRow className="font-medium"><TableCell>Прибыль до налогообложения</TableCell><TableCell className={`text-right font-bold ${profitLoss.profitBeforeTax >= 0 ? "text-green-600" : "text-red-600"}`}>{formatRub(profitLoss.profitBeforeTax)}</TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Налог на прибыль (Дт 68.04)</TableCell><TableCell className="text-right text-red-600">-{formatRub(profitLoss.incomeTax)}</TableCell></TableRow>

                      <TableRow className="bg-primary/10">
                        <TableCell className="font-bold text-lg">ЧИСТАЯ ПРИБЫЛЬ</TableCell>
                        <TableCell className={`text-right font-bold text-lg ${profitLoss.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>{formatRub(profitLoss.netProfit)}</TableCell>
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

        {/* Cash Flow Tab */}
        <TabsContent value="cashflow">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Label>С</Label>
              <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); scheduleApply(e.target.value, dateTo, asOfDate); }} className="w-40" />
            </div>
            <div className="flex items-center gap-2">
              <Label>По</Label>
              <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); scheduleApply(dateFrom, e.target.value, asOfDate); }} className="w-40" />
            </div>
          </div>

          {reportsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : cashFlow ? (
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle>Отчёт о движении денежных средств</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableBody>
                      <TableRow className="bg-muted/50">
                        <TableCell className="font-bold">Остаток на начало периода</TableCell>
                        <TableCell className="text-right font-bold">{formatRub(cashFlow.openingBalance)}</TableCell>
                      </TableRow>

                      <TableRow className="bg-muted/30"><TableCell className="font-bold">Поступления денежных средств</TableCell><TableCell></TableCell></TableRow>
                      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => openDrillDown("operating.in")}><TableCell className="pl-6">Касса (Дт 50)</TableCell><TableCell className="text-right text-green-600">+{formatRub(cashFlow.inflows.cash)}</TableCell></TableRow>
                      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => openDrillDown("operating.in")}><TableCell className="pl-6">Расчётный счёт (Дт 51)</TableCell><TableCell className="text-right text-green-600">+{formatRub(cashFlow.inflows.bank)}</TableCell></TableRow>
                      {cashFlow.inflows.forex > 0 && <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => openDrillDown("operating.in")}><TableCell className="pl-6">Валютный счёт (Дт 52)</TableCell><TableCell className="text-right text-green-600">+{formatRub(cashFlow.inflows.forex)}</TableCell></TableRow>}
                      <TableRow className="font-medium"><TableCell>Итого поступления</TableCell><TableCell className="text-right font-bold text-green-600">+{formatRub(cashFlow.inflows.total)}</TableCell></TableRow>

                      <TableRow className="bg-muted/30"><TableCell className="font-bold">Выплаты денежных средств</TableCell><TableCell></TableCell></TableRow>
                      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => openDrillDown("operating.out")}><TableCell className="pl-6">Касса (Кт 50)</TableCell><TableCell className="text-right text-red-600">-{formatRub(cashFlow.outflows.cash)}</TableCell></TableRow>
                      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => openDrillDown("operating.out")}><TableCell className="pl-6">Расчётный счёт (Кт 51)</TableCell><TableCell className="text-right text-red-600">-{formatRub(cashFlow.outflows.bank)}</TableCell></TableRow>
                      {cashFlow.outflows.forex > 0 && <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => openDrillDown("operating.out")}><TableCell className="pl-6">Валютный счёт (Кт 52)</TableCell><TableCell className="text-right text-red-600">-{formatRub(cashFlow.outflows.forex)}</TableCell></TableRow>}
                      <TableRow className="font-medium"><TableCell>Итого выплаты</TableCell><TableCell className="text-right font-bold text-red-600">-{formatRub(cashFlow.outflows.total)}</TableCell></TableRow>

                      <TableRow className="font-bold bg-muted/50">
                        <TableCell>Чистый денежный поток</TableCell>
                        <TableCell className={`text-right ${cashFlow.netCashFlow >= 0 ? "text-green-600" : "text-red-600"}`}>{formatRub(cashFlow.netCashFlow)}</TableCell>
                      </TableRow>
                      <TableRow className="bg-primary/10">
                        <TableCell className="font-bold text-lg">Остаток на конец периода</TableCell>
                        <TableCell className="text-right font-bold text-lg">{formatRub(cashFlow.closingBalance)}</TableCell>
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

        {/* Balance Sheet Tab */}
        <TabsContent value="balance">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Label>На дату</Label>
              <Input type="date" value={asOfDate} onChange={(e) => { setAsOfDate(e.target.value); scheduleApply(dateFrom, dateTo, e.target.value); }} className="w-40" />
            </div>
            {balanceSheet && !balanceSheet.balanced && (
              <span className="text-red-500 text-sm">Ошибка баланса!</span>
            )}
          </div>

          {reportsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : balanceSheet ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>АКТИВ</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableBody>
                      <TableRow className="bg-muted/30"><TableCell className="font-bold">Оборотные активы</TableCell><TableCell></TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Денежные средства (50+51+52)</TableCell><TableCell className="text-right">{formatRub(balanceSheet.assets.current.cash)}</TableCell></TableRow>
                      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => openDrillDown("assets.receivables")}><TableCell className="pl-6">Дебиторская задолженность (62)</TableCell><TableCell className="text-right">{formatRub(balanceSheet.assets.current.receivables)}</TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Товарные запасы (41)</TableCell><TableCell className="text-right">{formatRub(balanceSheet.assets.current.inventory)}</TableCell></TableRow>
                      {balanceSheet.assets.current.vatReceivable > 0 && <TableRow><TableCell className="pl-6">НДС к возмещению (19)</TableCell><TableCell className="text-right">{formatRub(balanceSheet.assets.current.vatReceivable)}</TableCell></TableRow>}
                      <TableRow className="font-medium"><TableCell>Итого оборотные активы</TableCell><TableCell className="text-right font-bold">{formatRub(balanceSheet.assets.current.total)}</TableCell></TableRow>

                      <TableRow className="bg-muted/30"><TableCell className="font-bold">Внеоборотные активы</TableCell><TableCell></TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Основные средства</TableCell><TableCell className="text-right">{formatRub(balanceSheet.assets.nonCurrent.fixedAssets)}</TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Нематериальные активы</TableCell><TableCell className="text-right">{formatRub(balanceSheet.assets.nonCurrent.intangibleAssets)}</TableCell></TableRow>
                      <TableRow className="font-medium"><TableCell>Итого внеоборотные активы</TableCell><TableCell className="text-right font-bold">{formatRub(balanceSheet.assets.nonCurrent.total)}</TableCell></TableRow>

                      <TableRow className="bg-primary/10">
                        <TableCell className="font-bold text-lg">ВСЕГО АКТИВ</TableCell>
                        <TableCell className="text-right font-bold text-lg">{formatRub(balanceSheet.assets.total)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>ПАССИВ</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableBody>
                      <TableRow className="bg-muted/30"><TableCell className="font-bold">Краткосрочные обязательства</TableCell><TableCell></TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Кредиторская задолженность (60)</TableCell><TableCell className="text-right">{formatRub(balanceSheet.liabilities.current.payables)}</TableCell></TableRow>
                      {balanceSheet.liabilities.current.customerAdvances > 0 && <TableRow><TableCell className="pl-6">Авансы покупателей (62)</TableCell><TableCell className="text-right">{formatRub(balanceSheet.liabilities.current.customerAdvances)}</TableCell></TableRow>}
                      <TableRow><TableCell className="pl-6">Краткосрочные кредиты (66)</TableCell><TableCell className="text-right">{formatRub(balanceSheet.liabilities.current.shortTermDebt)}</TableCell></TableRow>
                      {balanceSheet.liabilities.current.taxPayable > 0 && <TableRow><TableCell className="pl-6">Налоги к уплате (68)</TableCell><TableCell className="text-right">{formatRub(balanceSheet.liabilities.current.taxPayable)}</TableCell></TableRow>}
                      <TableRow className="font-medium"><TableCell>Итого краткосрочные</TableCell><TableCell className="text-right font-bold">{formatRub(balanceSheet.liabilities.current.total)}</TableCell></TableRow>

                      <TableRow className="bg-muted/30"><TableCell className="font-bold">Долгосрочные обязательства</TableCell><TableCell></TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Долгосрочные кредиты</TableCell><TableCell className="text-right">{formatRub(balanceSheet.liabilities.nonCurrent.longTermDebt)}</TableCell></TableRow>
                      <TableRow className="font-medium"><TableCell>Итого долгосрочные</TableCell><TableCell className="text-right font-bold">{formatRub(balanceSheet.liabilities.nonCurrent.total)}</TableCell></TableRow>

                      <TableRow className="bg-muted/50">
                        <TableCell className="font-bold">ИТОГО ОБЯЗАТЕЛЬСТВА</TableCell>
                        <TableCell className="text-right font-bold">{formatRub(balanceSheet.liabilities.total)}</TableCell>
                      </TableRow>

                      <TableRow className="bg-muted/30"><TableCell className="font-bold">Собственный капитал</TableCell><TableCell></TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Уставный капитал (80)</TableCell><TableCell className="text-right">{formatRub(balanceSheet.equity.shareCapital)}</TableCell></TableRow>
                      {balanceSheet.equity.additionalCapital > 0 && <TableRow><TableCell className="pl-6">Добавочный капитал (83)</TableCell><TableCell className="text-right">{formatRub(balanceSheet.equity.additionalCapital)}</TableCell></TableRow>}
                      {balanceSheet.equity.reserveCapital > 0 && <TableRow><TableCell className="pl-6">Резервный капитал (82)</TableCell><TableCell className="text-right">{formatRub(balanceSheet.equity.reserveCapital)}</TableCell></TableRow>}
                      <TableRow><TableCell className="pl-6">Нераспределённая прибыль (84+99)</TableCell><TableCell className="text-right">{formatRub(balanceSheet.equity.retainedEarnings)}</TableCell></TableRow>
                      <TableRow className="font-medium">
                        <TableCell>Итого капитал</TableCell>
                        <TableCell className="text-right font-bold">{formatRub(balanceSheet.equity.total)}</TableCell>
                      </TableRow>

                      <TableRow className="bg-primary/10">
                        <TableCell className="font-bold text-lg">ВСЕГО ПАССИВ</TableCell>
                        <TableCell className="text-right font-bold text-lg">{formatRub(balanceSheet.totalPassive)}</TableCell>
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

      {/* Drill-down Dialog */}
      <Dialog open={drillDownOpen} onOpenChange={setDrillDownOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{getDrillDownTitle(drillDownCategory)}</DialogTitle>
          </DialogHeader>
          
          {drillDownLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : drillDownData ? (
            <div className="space-y-4">
              {drillDownData.message && (
                <p className="text-sm text-muted-foreground">{drillDownData.message}</p>
              )}
              {drillDownData.truncated && (
                <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  Показаны первые 500 записей. Используйте фильтры дат для уточнения.
                </p>
              )}
              
              <div className="flex justify-between items-center py-2 border-b">
                <span className="font-medium">Итого:</span>
                <span className="font-bold text-lg">{formatRub(getTotalAmount())}</span>
              </div>
              
              {getAllDrillDownItems().length === 0 ? (
                <p className="text-center text-muted-foreground py-4">Нет данных за период</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Номер</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Дата</TableHead>
                      <TableHead>Контрагент</TableHead>
                      <TableHead className="text-right">Сумма</TableHead>
                      <TableHead>Документ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getAllDrillDownItems().map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-sm">
                          {item.isBalance ? (
                            item.number
                          ) : item.isPayment ? (
                            <Link
                              href="/finance/payments"
                              className="text-primary hover:underline inline-flex items-center gap-1"
                              onClick={() => setDrillDownOpen(false)}
                            >
                              {item.number}
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          ) : (
                            <Link
                              href={`/documents/${item.id}`}
                              className="text-primary hover:underline inline-flex items-center gap-1"
                              onClick={() => setDrillDownOpen(false)}
                            >
                              {item.number}
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{DOC_TYPE_LABELS[item.type] || item.type}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(item.date)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {item.counterparty || "—"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatRub(item.amount)}
                        </TableCell>
                        <TableCell>
                          {item.isPayment && item.linkedDocument && (
                            <Link
                              href={`/documents/${item.linkedDocument.id}`}
                              className="text-primary hover:underline inline-flex items-center gap-1 text-sm"
                              onClick={() => setDrillDownOpen(false)}
                            >
                              <span className="font-mono">{item.linkedDocument.number}</span>
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
