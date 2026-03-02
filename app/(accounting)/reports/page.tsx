"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Download, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { toast } from "sonner";
import { formatRub, formatDate } from "@/lib/shared/utils";

interface ProfitLoss {
  period: { from: string; to: string };
  grossRevenue: number;
  customerReturns: number;
  netRevenue: number;
  cogs: number;
  supplierReturns: number;
  grossProfit: number;
  margin: number;
}

interface CashFlow {
  period: { from: string; to: string };
  cashIn: number;
  cashOut: number;
  netCashFlow: number;
}

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

export default function ReportsPage() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);

  const [profitLoss, setProfitLoss] = useState<ProfitLoss | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlow | null>(null);
  const [balances, setBalances] = useState<BalancesReport | null>(null);

  const loadReports = async () => {
    if (!dateFrom || !dateTo) return;
    setLoading(true);
    try {
      const [plRes, cfRes, balRes] = await Promise.all([
        fetch(`/api/accounting/reports/profit-loss?dateFrom=${dateFrom}&dateTo=${dateTo}`),
        fetch(`/api/accounting/reports/cash-flow?dateFrom=${dateFrom}&dateTo=${dateTo}`),
        fetch("/api/accounting/reports/balances"),
      ]);

      const pl = await plRes.json();
      const cf = await cfRes.json();
      const bal = await balRes.json();

      setProfitLoss(pl);
      setCashFlow(cf);
      setBalances(bal);
    } catch {
      toast.error("Ошибка загрузки отчётов");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <PageHeader
        title="Отчёты"
        description="Финансовая аналитика"
        actions={
          <Button variant="outline" disabled>
            <Download className="h-4 w-4 mr-2" />
            Экспорт
          </Button>
        }
      />

      {/* Date Range Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Период отчётов</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">с</span>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">по</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-40"
              />
            </div>
            <Button onClick={loadReports} disabled={loading}>
              {loading ? "Загрузка..." : "Обновить"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="pnl">
        <TabsList>
          <TabsTrigger value="pnl">Прибыль и убытки</TabsTrigger>
          <TabsTrigger value="cash">Денежный поток</TabsTrigger>
          <TabsTrigger value="balances">Взаиморасчёты</TabsTrigger>
        </TabsList>

        {/* P&L Tab */}
        <TabsContent value="pnl" className="space-y-4">
          {profitLoss ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Выручка (нетто)</CardTitle>
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {formatRub(profitLoss.netRevenue)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Валовая: {formatRub(profitLoss.grossRevenue)}, возвраты: {formatRub(profitLoss.customerReturns)}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Себестоимость</CardTitle>
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">
                      {formatRub(profitLoss.cogs)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Возвраты поставщикам: {formatRub(profitLoss.supplierReturns)}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Валовая прибыль</CardTitle>
                    <Wallet className="h-4 w-4 text-blue-600" />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${profitLoss.grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatRub(profitLoss.grossProfit)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Маржа: {(profitLoss.margin * 100).toFixed(1)}%
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Детализация P&L за {formatDate(profitLoss.period.from)} — {formatDate(profitLoss.period.to)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Валовая выручка</TableCell>
                        <TableCell className="text-right">{formatRub(profitLoss.grossRevenue)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-muted-foreground pl-6">− Возвраты покупателей</TableCell>
                        <TableCell className="text-right text-red-600">−{formatRub(profitLoss.customerReturns)}</TableCell>
                      </TableRow>
                      <TableRow className="border-t">
                        <TableCell className="font-medium">Чистая выручка</TableCell>
                        <TableCell className="text-right font-medium">{formatRub(profitLoss.netRevenue)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-muted-foreground pl-6">− Себестоимость</TableCell>
                        <TableCell className="text-right text-red-600">−{formatRub(profitLoss.cogs)}</TableCell>
                      </TableRow>
                      <TableRow className="border-t-2 border-primary">
                        <TableCell className="font-bold text-lg">Валовая прибыль</TableCell>
                        <TableCell className={`text-right font-bold text-lg ${profitLoss.grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatRub(profitLoss.grossProfit)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Загрузка данных...
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Cash Flow Tab */}
        <TabsContent value="cash" className="space-y-4">
          {cashFlow ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Поступления</CardTitle>
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {formatRub(cashFlow.cashIn)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Выплаты</CardTitle>
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">
                      {formatRub(cashFlow.cashOut)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Чистый поток</CardTitle>
                    <Wallet className="h-4 w-4 text-blue-600" />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${cashFlow.netCashFlow >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatRub(cashFlow.netCashFlow)}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Загрузка данных...
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Balances Tab */}
        <TabsContent value="balances" className="space-y-4">
          {balances ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Дебиторская задолженность</CardTitle>
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {formatRub(balances.totalReceivable)}
                    </div>
                    <p className="text-xs text-muted-foreground">{balances.receivable.length} контрагентов</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Кредиторская задолженность</CardTitle>
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">
                      {formatRub(balances.totalPayable)}
                    </div>
                    <p className="text-xs text-muted-foreground">{balances.payable.length} контрагентов</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Чистый баланс</CardTitle>
                    <Wallet className="h-4 w-4 text-blue-600" />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${balances.netBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatRub(balances.netBalance)}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Receivables */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Нам должны (дебиторы)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Контрагент</TableHead>
                          <TableHead className="text-right">Сумма</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {balances.receivable.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={2} className="text-center text-muted-foreground py-4">
                              Нет задолженности
                            </TableCell>
                          </TableRow>
                        ) : (
                          balances.receivable.map((b) => (
                            <TableRow key={b.id}>
                              <TableCell>{b.counterparty.name}</TableCell>
                              <TableCell className="text-right text-green-600">
                                {formatRub(b.balanceRub)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Payables */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Мы должны (кредиторы)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Контрагент</TableHead>
                          <TableHead className="text-right">Сумма</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {balances.payable.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={2} className="text-center text-muted-foreground py-4">
                              Нет задолженности
                            </TableCell>
                          </TableRow>
                        ) : (
                          balances.payable.map((b) => (
                            <TableRow key={b.id}>
                              <TableCell>{b.counterparty.name}</TableCell>
                              <TableCell className="text-right text-red-600">
                                {formatRub(Math.abs(b.balanceRub))}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Загрузка данных...
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
