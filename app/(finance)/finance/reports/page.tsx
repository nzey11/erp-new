"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Label } from "@/components/ui/label";
import { Card, Tabs, Tag, Table, type TableColumnsType, Input } from "antd";
import { ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";
import { formatRub, formatDate } from "@/lib/shared/utils";
import { toast } from "sonner";
import { Modal } from "antd";

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
  "operating.in.bank", "operating.in.cash", "operating.in.forex",
  "operating.out.bank", "operating.out.cash", "operating.out.forex",
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
  const [reportTab, setReportTab] = useState("pnl");
  const [dateFrom, setDateFrom] = useState(getDefaultDateFrom);
  const [dateTo, setDateTo] = useState(getDefaultDateTo);
  const [asOfDate, setAsOfDate] = useState(getDefaultDateTo);

  // Debounced versions that actually trigger the fetch (600ms delay)
  const [appliedDateFrom, setAppliedDateFrom] = useState(getDefaultDateFrom);
  const [appliedDateTo, setAppliedDateTo] = useState(getDefaultDateTo);
  const [appliedAsOf, setAppliedAsOf] = useState(getDefaultDateTo);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      "operating.in": "Поступления (все счета)",
      "operating.out": "Выплаты (все счета)",
      "operating.in.bank": "Поступления — Расчётный счёт (Дт 51)",
      "operating.in.cash": "Поступления — Касса (Дт 50)",
      "operating.in.forex": "Поступления — Валютный счёт (Дт 52)",
      "operating.out.bank": "Выплаты — Расчётный счёт (Кт 51)",
      "operating.out.cash": "Выплаты — Касса (Кт 50)",
      "operating.out.forex": "Выплаты — Валютный счёт (Кт 52)",
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
    // For cash-flow categories, use only payments (canonical source) to avoid
    // duplicate rows when both Document and Payment records exist (BUG 1A)
    // Also, do NOT fall back to documents — they are not filtered by paymentMethod
    const isCashFlow = drillDownCategory.startsWith("operating.");
    const items = [
      ...(isCashFlow ? [] : drillDownData.documents),
      ...drillDownData.payments,
      ...(drillDownData.balances || []),
    ];
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const getTotalAmount = () => {
    return getAllDrillDownItems().reduce((sum, item) => sum + Number(item.amount), 0);
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

  return (
    <div className="space-y-6">
      <PageHeader title="Отчёты" />

      <Tabs
        activeKey={reportTab}
        onChange={setReportTab}
        items={[
          {
            key: "pnl",
            label: "Прибыли и убытки",
            children: (
              <>
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
                      <Card title={<span className="text-sm text-muted-foreground">Выручка</span>}>
                        <p className="text-2xl font-bold">{formatRub(profitLoss.netRevenue)}</p>
                      </Card>
                      <Card title={<span className="text-sm text-muted-foreground">Валовая прибыль</span>}>
                        <p className={`text-2xl font-bold ${profitLoss.grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatRub(profitLoss.grossProfit)}
                        </p>
                        <p className="text-xs text-muted-foreground">Маржа: {profitLoss.grossMarginPct.toFixed(1)}%</p>
                      </Card>
                      <Card title={<span className="text-sm text-muted-foreground">Операц. прибыль</span>}>
                        <p className={`text-2xl font-bold ${profitLoss.operatingProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatRub(profitLoss.operatingProfit)}
                        </p>
                      </Card>
                      <Card title={<span className="text-sm text-muted-foreground">Чистая прибыль</span>}>
                        <p className={`text-2xl font-bold ${profitLoss.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatRub(profitLoss.netProfit)}
                        </p>
                        <p className="text-xs text-muted-foreground">Маржа: {profitLoss.netMarginPct.toFixed(1)}%</p>
                      </Card>
                    </div>

                    <Card title="Отчёт о прибылях и убытках">
                      <table className="w-full text-sm">
                        <tbody>
                          <tr className="bg-muted/50"><td className="font-bold p-2">ВЫРУЧКА</td><td></td></tr>
                          <tr className="cursor-pointer hover:bg-muted/50" onClick={() => openDrillDown("grossRevenue")}><td className="pl-6 p-2">Выручка от продаж</td><td className="text-right p-2">{formatRub(profitLoss.revenue)}</td></tr>
                          {profitLoss.vatOnSales > 0 && <tr><td className="pl-6 p-2 text-muted-foreground">НДС с продаж</td><td className="text-right p-2 text-red-600">-{formatRub(profitLoss.vatOnSales)}</td></tr>}
                          <tr className="font-medium"><td className="p-2">Чистая выручка</td><td className="text-right p-2 font-bold">{formatRub(profitLoss.netRevenue)}</td></tr>
                          <tr className="bg-muted/50"><td className="font-bold p-2">СЕБЕСТОИМОСТЬ</td><td></td></tr>
                          <tr className="cursor-pointer hover:bg-muted/50" onClick={() => openDrillDown("cogs")}><td className="pl-6 p-2">Себестоимость продаж (Дт 90.2)</td><td className="text-right p-2 text-red-600">-{formatRub(profitLoss.cogs)}</td></tr>
                          <tr className="font-medium"><td className="p-2">Валовая прибыль</td><td className={`text-right p-2 font-bold ${profitLoss.grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>{formatRub(profitLoss.grossProfit)}</td></tr>
                          <tr className="bg-muted/50"><td className="font-bold p-2">ОПЕРАЦИОННЫЕ РАСХОДЫ</td><td></td></tr>
                          <tr className="cursor-pointer hover:bg-muted/50" onClick={() => openDrillDown("sellingExpenses")}><td className="pl-6 p-2">Расходы на продажу (Дт 44)</td><td className="text-right p-2 text-red-600">-{formatRub(profitLoss.sellingExpenses)}</td></tr>
                          <tr className="font-medium"><td className="p-2">Операционная прибыль</td><td className={`text-right p-2 font-bold ${profitLoss.operatingProfit >= 0 ? "text-green-600" : "text-red-600"}`}>{formatRub(profitLoss.operatingProfit)}</td></tr>
                          <tr className="bg-muted/50"><td className="font-bold p-2">ПРОЧИЕ ДОХОДЫ И РАСХОДЫ</td><td></td></tr>
                          <tr><td className="pl-6 p-2">Прочие доходы (Кт 91.1)</td><td className="text-right p-2 text-green-600">+{formatRub(profitLoss.otherIncome)}</td></tr>
                          <tr><td className="pl-6 p-2">Прочие расходы (Дт 91.2)</td><td className="text-right p-2 text-red-600">-{formatRub(profitLoss.otherExpenses)}</td></tr>
                          <tr className="font-medium"><td className="p-2">Прибыль до налогообложения</td><td className={`text-right p-2 font-bold ${profitLoss.profitBeforeTax >= 0 ? "text-green-600" : "text-red-600"}`}>{formatRub(profitLoss.profitBeforeTax)}</td></tr>
                          <tr><td className="pl-6 p-2">Налог на прибыль (Дт 68.04)</td><td className="text-right p-2 text-red-600">-{formatRub(profitLoss.incomeTax)}</td></tr>
                          <tr className="bg-primary/10"><td className="font-bold text-lg p-2">ЧИСТАЯ ПРИБЫЛЬ</td><td className={`text-right font-bold text-lg p-2 ${profitLoss.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>{formatRub(profitLoss.netProfit)}</td></tr>
                        </tbody>
                      </table>
                    </Card>
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">Нет данных</div>
                )}
              </>
            ),
          },
          {
            key: "cashflow",
            label: "Денежный поток",
            children: (
              <>
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
                    <Card title="Отчёт о движении денежных средств">
                      <table className="w-full text-sm">
                        <tbody>
                          <tr className="bg-muted/50"><td className="font-bold p-2">Остаток на начало периода</td><td className="text-right p-2 font-bold">{formatRub(cashFlow.openingBalance)}</td></tr>
                          <tr className="bg-muted/30"><td className="font-bold p-2">Поступления денежных средств</td><td></td></tr>
                          <tr className="cursor-pointer hover:bg-muted/50" onClick={() => openDrillDown("operating.in.cash")}><td className="pl-6 p-2">Касса (Дт 50)</td><td className="text-right p-2 text-green-600">+{formatRub(cashFlow.inflows.cash)}</td></tr>
                          <tr className="cursor-pointer hover:bg-muted/50" onClick={() => openDrillDown("operating.in.bank")}><td className="pl-6 p-2">Расчётный счёт (Дт 51)</td><td className="text-right p-2 text-green-600">+{formatRub(cashFlow.inflows.bank)}</td></tr>
                          {cashFlow.inflows.forex > 0 && <tr className="cursor-pointer hover:bg-muted/50" onClick={() => openDrillDown("operating.in.forex")}><td className="pl-6 p-2">Валютный счёт (Дт 52)</td><td className="text-right p-2 text-green-600">+{formatRub(cashFlow.inflows.forex)}</td></tr>}
                          <tr className="font-medium"><td className="p-2">Итого поступления</td><td className="text-right p-2 font-bold text-green-600">+{formatRub(cashFlow.inflows.total)}</td></tr>
                          <tr className="bg-muted/30"><td className="font-bold p-2">Выплаты денежных средств</td><td></td></tr>
                          <tr className="cursor-pointer hover:bg-muted/50" onClick={() => openDrillDown("operating.out.cash")}><td className="pl-6 p-2">Касса (Кт 50)</td><td className="text-right p-2 text-red-600">-{formatRub(cashFlow.outflows.cash)}</td></tr>
                          <tr className="cursor-pointer hover:bg-muted/50" onClick={() => openDrillDown("operating.out.bank")}><td className="pl-6 p-2">Расчётный счёт (Кт 51)</td><td className="text-right p-2 text-red-600">-{formatRub(cashFlow.outflows.bank)}</td></tr>
                          {cashFlow.outflows.forex > 0 && <tr className="cursor-pointer hover:bg-muted/50" onClick={() => openDrillDown("operating.out.forex")}><td className="pl-6 p-2">Валютный счёт (Кт 52)</td><td className="text-right p-2 text-red-600">-{formatRub(cashFlow.outflows.forex)}</td></tr>}
                          <tr className="font-medium"><td className="p-2">Итого выплаты</td><td className="text-right p-2 font-bold text-red-600">-{formatRub(cashFlow.outflows.total)}</td></tr>
                          <tr className="font-bold bg-muted/50"><td className="p-2">Чистый денежный поток</td><td className={`text-right p-2 ${cashFlow.netCashFlow >= 0 ? "text-green-600" : "text-red-600"}`}>{formatRub(cashFlow.netCashFlow)}</td></tr>
                          <tr className="bg-primary/10"><td className="font-bold text-lg p-2">Остаток на конец периода</td><td className="text-right font-bold text-lg p-2">{formatRub(cashFlow.closingBalance)}</td></tr>
                        </tbody>
                      </table>
                    </Card>
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">Нет данных</div>
                )}
              </>
            ),
          },
          {
            key: "balance",
            label: "Баланс",
            children: (
              <>
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
                    <Card title="АКТИВ">
                      <table className="w-full text-sm">
                        <tbody>
                          <tr className="bg-muted/30"><td className="font-bold p-2">Оборотные активы</td><td></td></tr>
                          <tr><td className="pl-6 p-2">Денежные средства (50+51+52)</td><td className="text-right p-2">{formatRub(balanceSheet.assets.current.cash)}</td></tr>
                          <tr className="cursor-pointer hover:bg-muted/50" onClick={() => openDrillDown("assets.receivables")}><td className="pl-6 p-2">Дебиторская задолженность (62)</td><td className="text-right p-2">{formatRub(balanceSheet.assets.current.receivables)}</td></tr>
                          <tr><td className="pl-6 p-2">Товарные запасы (41)</td><td className="text-right p-2">{formatRub(balanceSheet.assets.current.inventory)}</td></tr>
                          {balanceSheet.assets.current.vatReceivable > 0 && <tr><td className="pl-6 p-2">НДС к возмещению (19)</td><td className="text-right p-2">{formatRub(balanceSheet.assets.current.vatReceivable)}</td></tr>}
                          <tr className="font-medium"><td className="p-2">Итого оборотные активы</td><td className="text-right p-2 font-bold">{formatRub(balanceSheet.assets.current.total)}</td></tr>
                          <tr className="bg-muted/30"><td className="font-bold p-2">Внеоборотные активы</td><td></td></tr>
                          <tr><td className="pl-6 p-2">Основные средства</td><td className="text-right p-2">{formatRub(balanceSheet.assets.nonCurrent.fixedAssets)}</td></tr>
                          <tr><td className="pl-6 p-2">Нематериальные активы</td><td className="text-right p-2">{formatRub(balanceSheet.assets.nonCurrent.intangibleAssets)}</td></tr>
                          <tr className="font-medium"><td className="p-2">Итого внеоборотные активы</td><td className="text-right p-2 font-bold">{formatRub(balanceSheet.assets.nonCurrent.total)}</td></tr>
                          <tr className="bg-primary/10"><td className="font-bold text-lg p-2">ВСЕГО АКТИВ</td><td className="text-right font-bold text-lg p-2">{formatRub(balanceSheet.assets.total)}</td></tr>
                        </tbody>
                      </table>
                    </Card>

                    <Card title="ПАССИВ">
                      <table className="w-full text-sm">
                        <tbody>
                          <tr className="bg-muted/30"><td className="font-bold p-2">Краткосрочные обязательства</td><td></td></tr>
                          <tr><td className="pl-6 p-2">Кредиторская задолженность (60)</td><td className="text-right p-2">{formatRub(balanceSheet.liabilities.current.payables)}</td></tr>
                          {balanceSheet.liabilities.current.customerAdvances > 0 && <tr><td className="pl-6 p-2">Авансы покупателей (62)</td><td className="text-right p-2">{formatRub(balanceSheet.liabilities.current.customerAdvances)}</td></tr>}
                          <tr><td className="pl-6 p-2">Краткосрочные кредиты (66)</td><td className="text-right p-2">{formatRub(balanceSheet.liabilities.current.shortTermDebt)}</td></tr>
                          {balanceSheet.liabilities.current.taxPayable > 0 && <tr><td className="pl-6 p-2">Налоги к уплате (68)</td><td className="text-right p-2">{formatRub(balanceSheet.liabilities.current.taxPayable)}</td></tr>}
                          <tr className="font-medium"><td className="p-2">Итого краткосрочные</td><td className="text-right p-2 font-bold">{formatRub(balanceSheet.liabilities.current.total)}</td></tr>
                          <tr className="bg-muted/30"><td className="font-bold p-2">Долгосрочные обязательства</td><td></td></tr>
                          <tr><td className="pl-6 p-2">Долгосрочные кредиты</td><td className="text-right p-2">{formatRub(balanceSheet.liabilities.nonCurrent.longTermDebt)}</td></tr>
                          <tr className="font-medium"><td className="p-2">Итого долгосрочные</td><td className="text-right p-2 font-bold">{formatRub(balanceSheet.liabilities.nonCurrent.total)}</td></tr>
                          <tr className="bg-muted/50"><td className="font-bold p-2">ИТОГО ОБЯЗАТЕЛЬСТВА</td><td className="text-right p-2 font-bold">{formatRub(balanceSheet.liabilities.total)}</td></tr>
                          <tr className="bg-muted/30"><td className="font-bold p-2">Собственный капитал</td><td></td></tr>
                          <tr><td className="pl-6 p-2">Уставный капитал (80)</td><td className="text-right p-2">{formatRub(balanceSheet.equity.shareCapital)}</td></tr>
                          {balanceSheet.equity.additionalCapital > 0 && <tr><td className="pl-6 p-2">Добавочный капитал (83)</td><td className="text-right p-2">{formatRub(balanceSheet.equity.additionalCapital)}</td></tr>}
                          {balanceSheet.equity.reserveCapital > 0 && <tr><td className="pl-6 p-2">Резервный капитал (82)</td><td className="text-right p-2">{formatRub(balanceSheet.equity.reserveCapital)}</td></tr>}
                          <tr><td className="pl-6 p-2">Нераспределённая прибыль (84+99)</td><td className="text-right p-2">{formatRub(balanceSheet.equity.retainedEarnings)}</td></tr>
                          <tr className="font-medium"><td className="p-2">Итого капитал</td><td className="text-right p-2 font-bold">{formatRub(balanceSheet.equity.total)}</td></tr>
                          <tr className="bg-primary/10"><td className="font-bold text-lg p-2">ВСЕГО ПАССИВ</td><td className="text-right font-bold text-lg p-2">{formatRub(balanceSheet.totalPassive)}</td></tr>
                        </tbody>
                      </table>
                    </Card>
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">Нет данных</div>
                )}
              </>
            ),
          },
        ]}
      />

      {/* Drill-down Modal (Ant Design) */}
      <Modal
        title={getDrillDownTitle(drillDownCategory)}
        open={drillDownOpen}
        onCancel={() => setDrillDownOpen(false)}
        width="80vw"
        style={{ top: 20 }}
        styles={{
          body: {
            maxHeight: "75vh",
            overflowY: "auto",
            padding: "16px",
          },
        }}
        footer={
          !drillDownLoading && drillDownData && getAllDrillDownItems().length > 0 ? (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 24, fontWeight: "bold" }}>
              {drillDownCategory.startsWith("operating.") ? (
                <div style={{ textAlign: "right" }}>
                  <div>Дебет:&nbsp;&nbsp; {formatRub(getAllDrillDownItems().filter(i => i.type === "income" || drillDownCategory.startsWith("operating.in")).reduce((s, i) => s + Number(i.amount), 0))}</div>
                  <div>Кредит: {formatRub(getAllDrillDownItems().filter(i => i.type === "expense" || drillDownCategory.startsWith("operating.out")).reduce((s, i) => s + Number(i.amount), 0))}</div>
                  <div>Сальдо: {formatRub(getTotalAmount())}</div>
                </div>
              ) : (
                <span>Итого: {formatRub(getTotalAmount())}</span>
              )}
              <span style={{ color: "#8c8c8c", fontWeight: "normal" }}>
                {getAllDrillDownItems().length} записей
              </span>
            </div>
          ) : null
        }
      >
        {drillDownLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : drillDownData ? (
          <div className="space-y-3">
            {drillDownData.message && (
              <p className="text-sm text-muted-foreground">{drillDownData.message}</p>
            )}
            {drillDownData.truncated && (
              <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                Показаны первые 500 записей. Используйте фильтры дат для уточнения.
              </p>
            )}
            {getAllDrillDownItems().length === 0 ? (
              <p className="text-center text-muted-foreground py-4">Нет данных за период</p>
            ) : (() => {
              const drillColumns: TableColumnsType<DrillDownItem> = [
                { key: "date", title: "Дата", render: (_, item) => <span className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(item.date)}</span> },
                { key: "number", title: "Номер", render: (_, item) => (
                  <span className="font-mono text-sm">
                    {item.isBalance ? item.number : item.isPayment ? (
                      <Link href="/finance/payments" className="text-primary hover:underline inline-flex items-center gap-1" onClick={() => setDrillDownOpen(false)}>
                        {item.number}<ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      <Link href={`/documents/${item.id}`} className="text-primary hover:underline inline-flex items-center gap-1" onClick={() => setDrillDownOpen(false)}>
                        {item.number}<ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </span>
                )},
                { key: "type", title: "Тип", render: (_, item) => (
                  <Tag>{item.isBalance ? DOC_TYPE_LABELS["counterparty_balance"] : item.isPayment ? (item.type === "income" ? "Входящий платёж" : "Исходящий платёж") : (DOC_TYPE_LABELS[item.type] || item.type)}</Tag>
                )},
                { key: "counterparty", title: "Контрагент", render: (_, item) => <span className="text-sm">{item.counterparty || "—"}</span> },
                { key: "amount", title: "Сумма", align: "right", render: (_, item) => <span className="font-medium">{formatRub(item.amount)}</span> },
                { key: "linked", title: "Связ. документ", render: (_, item) => item.isPayment && item.linkedDocument ? (
                  <Link href={`/documents/${item.linkedDocument.id}`} className="text-primary hover:underline inline-flex items-center gap-1 text-sm" onClick={() => setDrillDownOpen(false)}>
                    <span className="font-mono">{item.linkedDocument.number}</span><ExternalLink className="h-3 w-3" />
                  </Link>
                ) : null },
              ];
              return <Table columns={drillColumns} dataSource={getAllDrillDownItems()} rowKey="id" pagination={false} size="small" />;
            })()}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
