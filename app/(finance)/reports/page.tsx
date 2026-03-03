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
}

interface CashFlow {
  period: { from: string; to: string };
  cashIn: number;
  cashOut: number;
  netCashFlow: number;
}

export default function ReportsPage() {
  const [reportTab, setReportTab] = useState("cashflow");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [profitLoss, setProfitLoss] = useState<ProfitLoss | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlow | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);

  useEffect(() => {
    loadReports();
  }, [reportTab, dateFrom, dateTo]);

  const loadReports = async () => {
    setReportsLoading(true);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo });

      if (reportTab === "cashflow" || reportTab === "all") {
        const res = await fetch(`/api/finance/reports/cash-flow?${params}`);
        if (res.ok) setCashFlow(await res.json());
      }
      if (reportTab === "pnl" || reportTab === "all") {
        const res = await fetch(`/api/finance/reports/profit-loss?${params}`);
        if (res.ok) setProfitLoss(await res.json());
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

      {/* Date range */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Label>С</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
        </div>
        <div className="flex items-center gap-2">
          <Label>По</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
        </div>
      </div>

      {/* Report tabs */}
      <Tabs value={reportTab} onValueChange={setReportTab}>
        <TabsList>
          <TabsTrigger value="cashflow">Денежный поток</TabsTrigger>
          <TabsTrigger value="pnl">Прибыль и убытки</TabsTrigger>
        </TabsList>

        <TabsContent value="cashflow">
          {reportsLoading ? (
            <div className="py-8 text-center text-muted-foreground">Загрузка...</div>
          ) : cashFlow ? (
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Поступления</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-green-600">{formatRub(cashFlow.cashIn)}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Выплаты</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-red-600">{formatRub(cashFlow.cashOut)}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Чистый поток</CardTitle></CardHeader>
                <CardContent>
                  <p className={`text-2xl font-bold ${cashFlow.netCashFlow >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatRub(cashFlow.netCashFlow)}
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">Нет данных</div>
          )}
        </TabsContent>

        <TabsContent value="pnl">
          {reportsLoading ? (
            <div className="py-8 text-center text-muted-foreground">Загрузка...</div>
          ) : profitLoss ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Чистая выручка</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold">{formatRub(profitLoss.netRevenue)}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Себестоимость</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold text-red-600">{formatRub(profitLoss.cogs)}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Валовая прибыль</CardTitle></CardHeader>
                  <CardContent>
                    <p className={`text-2xl font-bold ${profitLoss.grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatRub(profitLoss.grossProfit)}
                    </p>
                    <p className="text-sm text-muted-foreground">Маржа: {profitLoss.margin.toFixed(1)}%</p>
                  </CardContent>
                </Card>
              </div>
              <div className="border rounded-lg">
                <Table>
                  <TableBody>
                    <TableRow><TableCell className="font-medium">Выручка (валовая)</TableCell><TableCell className="text-right">{formatRub(profitLoss.grossRevenue)}</TableCell></TableRow>
                    <TableRow><TableCell className="text-muted-foreground pl-6">Возвраты покупателей</TableCell><TableCell className="text-right text-red-600">-{formatRub(profitLoss.customerReturns)}</TableCell></TableRow>
                    <TableRow className="font-medium"><TableCell>Чистая выручка</TableCell><TableCell className="text-right">{formatRub(profitLoss.netRevenue)}</TableCell></TableRow>
                    <TableRow><TableCell className="font-medium">Себестоимость</TableCell><TableCell className="text-right text-red-600">{formatRub(profitLoss.cogs)}</TableCell></TableRow>
                    <TableRow><TableCell className="text-muted-foreground pl-6">Возвраты поставщикам</TableCell><TableCell className="text-right text-green-600">+{formatRub(profitLoss.supplierReturns)}</TableCell></TableRow>
                    <TableRow className="font-bold text-lg"><TableCell>Валовая прибыль</TableCell><TableCell className={`text-right ${profitLoss.grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>{formatRub(profitLoss.grossProfit)}</TableCell></TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">Нет данных</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
