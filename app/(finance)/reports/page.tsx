"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { formatRub } from "@/lib/shared/utils";
import { toast } from "sonner";

interface ProfitLoss {
  period: { from: string; to: string };
  grossRevenue: number;
  customerReturns: number;
  netRevenue: number;
  cogs: number;
  supplierReturns: number;
  grossProfit: number;
  margin: number;
  operatingExpenses: number;
  ebitda: number;
  depreciation: number;
  ebit: number;
  interestExpense: number;
  profitBeforeTax: number;
  incomeTax: number;
  netIncome: number;
  netMargin: number;
}

interface CashFlowSection {
  in: number;
  out: number;
  net: number;
}

interface CashFlow {
  period: { from: string; to: string };
  openingBalance: number;
  operating: CashFlowSection;
  investing: CashFlowSection;
  financing: CashFlowSection;
  netCashFlow: number;
  closingBalance: number;
}

interface BalanceSheet {
  asOfDate: string;
  assets: {
    current: { cash: number; receivables: number; stock: number; total: number };
    nonCurrent: { fixedAssets: number; intangibleAssets: number; total: number };
    total: number;
  };
  liabilities: {
    current: { payables: number; shortTermDebt: number; total: number };
    nonCurrent: { longTermDebt: number; total: number };
    total: number;
  };
  equity: { shareCapital: number; retainedEarnings: number; total: number };
  balanceCheck: boolean;
}

export default function ReportsPage() {
  const [reportTab, setReportTab] = useState("pnl");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [profitLoss, setProfitLoss] = useState<ProfitLoss | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlow | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheet | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);

  useEffect(() => {
    loadReports();
  }, [reportTab, dateFrom, dateTo, asOfDate]);

  const loadReports = async () => {
    setReportsLoading(true);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo });

      if (reportTab === "cashflow") {
        const res = await fetch(`/api/finance/reports/cash-flow?${params}`);
        if (res.ok) setCashFlow(await res.json());
      }
      if (reportTab === "pnl") {
        const res = await fetch(`/api/finance/reports/profit-loss?${params}`);
        if (res.ok) setProfitLoss(await res.json());
      }
      if (reportTab === "balance") {
        const res = await fetch(`/api/finance/reports/balance-sheet?asOfDate=${asOfDate}`);
        if (res.ok) setBalanceSheet(await res.json());
      }
    } catch {
      toast.error("Ошибка загрузки отчётов");
    } finally {
      setReportsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Отчёты" />

      {/* Report tabs */}
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
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
            </div>
            <div className="flex items-center gap-2">
              <Label>По</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
            </div>
          </div>

          {reportsLoading ? (
            <div className="py-8 text-center text-muted-foreground">Загрузка...</div>
          ) : profitLoss ? (
            <div className="space-y-4">
              {/* Summary Cards */}
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
                    <p className="text-xs text-muted-foreground">Маржа: {profitLoss.margin.toFixed(1)}%</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">EBIT</CardTitle></CardHeader>
                  <CardContent>
                    <p className={`text-2xl font-bold ${profitLoss.ebit >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatRub(profitLoss.ebit)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Чистая прибыль</CardTitle></CardHeader>
                  <CardContent>
                    <p className={`text-2xl font-bold ${profitLoss.netIncome >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatRub(profitLoss.netIncome)}
                    </p>
                    <p className="text-xs text-muted-foreground">Маржа: {profitLoss.netMargin.toFixed(1)}%</p>
                  </CardContent>
                </Card>
              </div>

              {/* Detailed P&L Table */}
              <Card>
                <CardHeader><CardTitle>Отчёт о прибылях и убытках</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableBody>
                      {/* Revenue Section */}
                      <TableRow className="bg-muted/50"><TableCell className="font-bold">ВЫРУЧКА</TableCell><TableCell></TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Выручка от продаж</TableCell><TableCell className="text-right">{formatRub(profitLoss.grossRevenue)}</TableCell></TableRow>
                      <TableRow><TableCell className="pl-6 text-muted-foreground">Возвраты покупателей</TableCell><TableCell className="text-right text-red-600">-{formatRub(profitLoss.customerReturns)}</TableCell></TableRow>
                      <TableRow className="font-medium"><TableCell>Чистая выручка</TableCell><TableCell className="text-right font-bold">{formatRub(profitLoss.netRevenue)}</TableCell></TableRow>

                      {/* Cost Section */}
                      <TableRow className="bg-muted/50"><TableCell className="font-bold">СЕБЕСТОИМОСТЬ</TableCell><TableCell></TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Себестоимость продаж</TableCell><TableCell className="text-right text-red-600">{formatRub(profitLoss.cogs)}</TableCell></TableRow>
                      <TableRow><TableCell className="pl-6 text-muted-foreground">Возвраты поставщикам</TableCell><TableCell className="text-right text-green-600">-{formatRub(profitLoss.supplierReturns)}</TableCell></TableRow>
                      <TableRow className="font-medium"><TableCell>Валовая прибыль</TableCell><TableCell className={`text-right font-bold ${profitLoss.grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>{formatRub(profitLoss.grossProfit)}</TableCell></TableRow>

                      {/* Operating Section */}
                      <TableRow className="bg-muted/50"><TableCell className="font-bold">ОПЕРАЦИОННЫЕ РАСХОДЫ</TableCell><TableCell></TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Коммерческие и управленческие расходы</TableCell><TableCell className="text-right text-red-600">{formatRub(profitLoss.operatingExpenses)}</TableCell></TableRow>
                      <TableRow><TableCell className="pl-6 text-muted-foreground">Амортизация</TableCell><TableCell className="text-right text-red-600">{formatRub(profitLoss.depreciation)}</TableCell></TableRow>
                      <TableRow className="font-medium"><TableCell>EBIT (Операционная прибыль)</TableCell><TableCell className={`text-right font-bold ${profitLoss.ebit >= 0 ? "text-green-600" : "text-red-600"}`}>{formatRub(profitLoss.ebit)}</TableCell></TableRow>

                      {/* Financial Section */}
                      <TableRow className="bg-muted/50"><TableCell className="font-bold">ФИНАНСОВЫЕ РЕЗУЛЬТАТЫ</TableCell><TableCell></TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Проценты к уплате</TableCell><TableCell className="text-right text-red-600">{formatRub(profitLoss.interestExpense)}</TableCell></TableRow>
                      <TableRow className="font-medium"><TableCell>Прибыль до налогообложения</TableCell><TableCell className={`text-right font-bold ${profitLoss.profitBeforeTax >= 0 ? "text-green-600" : "text-red-600"}`}>{formatRub(profitLoss.profitBeforeTax)}</TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Налог на прибыль (20%)</TableCell><TableCell className="text-right text-red-600">{formatRub(profitLoss.incomeTax)}</TableCell></TableRow>

                      {/* Net Income */}
                      <TableRow className="bg-primary/10">
                        <TableCell className="font-bold text-lg">ЧИСТАЯ ПРИБЫЛЬ</TableCell>
                        <TableCell className={`text-right font-bold text-lg ${profitLoss.netIncome >= 0 ? "text-green-600" : "text-red-600"}`}>{formatRub(profitLoss.netIncome)}</TableCell>
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
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
            </div>
            <div className="flex items-center gap-2">
              <Label>По</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
            </div>
          </div>

          {reportsLoading ? (
            <div className="py-8 text-center text-muted-foreground">Загрузка...</div>
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

                      {/* Operating */}
                      <TableRow className="bg-muted/30"><TableCell className="font-bold">Операционная деятельность</TableCell><TableCell></TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Поступления от покупателей</TableCell><TableCell className="text-right text-green-600">+{formatRub(cashFlow.operating.in)}</TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Выплаты поставщикам и прочие</TableCell><TableCell className="text-right text-red-600">-{formatRub(cashFlow.operating.out)}</TableCell></TableRow>
                      <TableRow className="font-medium"><TableCell>Чистый денежный поток от операций</TableCell><TableCell className={`text-right font-bold ${cashFlow.operating.net >= 0 ? "text-green-600" : "text-red-600"}`}>{formatRub(cashFlow.operating.net)}</TableCell></TableRow>

                      {/* Investing */}
                      <TableRow className="bg-muted/30"><TableCell className="font-bold">Инвестиционная деятельность</TableCell><TableCell></TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Продажа активов</TableCell><TableCell className="text-right text-green-600">+{formatRub(cashFlow.investing.in)}</TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Приобретение активов</TableCell><TableCell className="text-right text-red-600">-{formatRub(cashFlow.investing.out)}</TableCell></TableRow>
                      <TableRow className="font-medium"><TableCell>Чистый денежный поток от инвестиций</TableCell><TableCell className={`text-right font-bold ${cashFlow.investing.net >= 0 ? "text-green-600" : "text-red-600"}`}>{formatRub(cashFlow.investing.net)}</TableCell></TableRow>

                      {/* Financing */}
                      <TableRow className="bg-muted/30"><TableCell className="font-bold">Финансовая деятельность</TableCell><TableCell></TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Получение кредитов и займов</TableCell><TableCell className="text-right text-green-600">+{formatRub(cashFlow.financing.in)}</TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Погашение кредитов и дивиденды</TableCell><TableCell className="text-right text-red-600">-{formatRub(cashFlow.financing.out)}</TableCell></TableRow>
                      <TableRow className="font-medium"><TableCell>Чистый денежный поток от финансирования</TableCell><TableCell className={`text-right font-bold ${cashFlow.financing.net >= 0 ? "text-green-600" : "text-red-600"}`}>{formatRub(cashFlow.financing.net)}</TableCell></TableRow>

                      {/* Total */}
                      <TableRow className="font-bold bg-muted/50">
                        <TableCell>Чистый денежный поток (всего)</TableCell>
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
              <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="w-40" />
            </div>
            {balanceSheet && !balanceSheet.balanceCheck && (
              <span className="text-red-500 text-sm">Ошибка баланса!</span>
            )}
          </div>

          {reportsLoading ? (
            <div className="py-8 text-center text-muted-foreground">Загрузка...</div>
          ) : balanceSheet ? (
            <div className="grid gap-4 md:grid-cols-2">
              {/* Assets */}
              <Card>
                <CardHeader><CardTitle>АКТИВ</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableBody>
                      <TableRow className="bg-muted/30"><TableCell className="font-bold">Оборотные активы</TableCell><TableCell></TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Денежные средства</TableCell><TableCell className="text-right">{formatRub(balanceSheet.assets.current.cash)}</TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Дебиторская задолженность</TableCell><TableCell className="text-right">{formatRub(balanceSheet.assets.current.receivables)}</TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Товарные запасы</TableCell><TableCell className="text-right">{formatRub(balanceSheet.assets.current.stock)}</TableCell></TableRow>
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

              {/* Liabilities & Equity */}
              <Card>
                <CardHeader><CardTitle>ПАССИВ</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableBody>
                      <TableRow className="bg-muted/30"><TableCell className="font-bold">Краткосрочные обязательства</TableCell><TableCell></TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Кредиторская задолженность</TableCell><TableCell className="text-right">{formatRub(balanceSheet.liabilities.current.payables)}</TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Краткосрочные кредиты</TableCell><TableCell className="text-right">{formatRub(balanceSheet.liabilities.current.shortTermDebt)}</TableCell></TableRow>
                      <TableRow className="font-medium"><TableCell>Итого краткосрочные</TableCell><TableCell className="text-right font-bold">{formatRub(balanceSheet.liabilities.current.total)}</TableCell></TableRow>

                      <TableRow className="bg-muted/30"><TableCell className="font-bold">Долгосрочные обязательства</TableCell><TableCell></TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Долгосрочные кредиты</TableCell><TableCell className="text-right">{formatRub(balanceSheet.liabilities.nonCurrent.longTermDebt)}</TableCell></TableRow>
                      <TableRow className="font-medium"><TableCell>Итого долгосрочные</TableCell><TableCell className="text-right font-bold">{formatRub(balanceSheet.liabilities.nonCurrent.total)}</TableCell></TableRow>

                      <TableRow className="bg-muted/50">
                        <TableCell className="font-bold">ИТОГО ОБЯЗАТЕЛЬСТВА</TableCell>
                        <TableCell className="text-right font-bold">{formatRub(balanceSheet.liabilities.total)}</TableCell>
                      </TableRow>

                      <TableRow className="bg-muted/30"><TableCell className="font-bold">Собственный капитал</TableCell><TableCell></TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Уставный капитал</TableCell><TableCell className="text-right">{formatRub(balanceSheet.equity.shareCapital)}</TableCell></TableRow>
                      <TableRow><TableCell className="pl-6">Нераспределённая прибыль</TableCell><TableCell className="text-right">{formatRub(balanceSheet.equity.retainedEarnings)}</TableCell></TableRow>
                      <TableRow className="font-medium">
                        <TableCell>Итого капитал</TableCell>
                        <TableCell className="text-right font-bold">{formatRub(balanceSheet.equity.total)}</TableCell>
                      </TableRow>

                      <TableRow className="bg-primary/10">
                        <TableCell className="font-bold text-lg">ВСЕГО ПАССИВ</TableCell>
                        <TableCell className="text-right font-bold text-lg">{formatRub(balanceSheet.liabilities.total + balanceSheet.equity.total)}</TableCell>
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
