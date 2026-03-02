"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { formatRub } from "@/lib/shared/utils";
import { DocumentsTable, DOC_TYPE_OPTIONS } from "@/components/accounting";

const FINANCE_TYPES = DOC_TYPE_OPTIONS.filter((t) => t.group === "finance");

interface Counterparty { id: string; name: string }

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

export default function FinancePage() {
  const [tab, setTab] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState("");
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [createCounterpartyId, setCreateCounterpartyId] = useState("");

  // Reports state
  const [reportTab, setReportTab] = useState("cashflow");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [profitLoss, setProfitLoss] = useState<ProfitLoss | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlow | null>(null);
  const [balances, setBalances] = useState<BalancesReport | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);

  useEffect(() => {
    fetch("/api/accounting/counterparties?limit=100")
      .then((r) => r.json())
      .then((data) => setCounterparties(data.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === "reports") loadReports();
  }, [tab, reportTab, dateFrom, dateTo]);

  const loadReports = async () => {
    setReportsLoading(true);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo });

      if (reportTab === "cashflow" || reportTab === "all") {
        const res = await fetch(`/api/accounting/reports/cash-flow?${params}`);
        if (res.ok) setCashFlow(await res.json());
      }
      if (reportTab === "pnl" || reportTab === "all") {
        const res = await fetch(`/api/accounting/reports/profit-loss?${params}`);
        if (res.ok) setProfitLoss(await res.json());
      }
      if (reportTab === "balances" || reportTab === "all") {
        const res = await fetch("/api/accounting/reports/balances");
        if (res.ok) setBalances(await res.json());
      }
    } catch {
      toast.error("Ошибка загрузки отчётов");
    } finally {
      setReportsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!createType) {
      toast.error("Выберите тип документа");
      return;
    }
    setCreating(true);
    try {
      const body: Record<string, unknown> = { type: createType, items: [] };
      if (createCounterpartyId) body.counterpartyId = createCounterpartyId;

      const res = await fetch("/api/accounting/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка");
      }

      toast.success("Документ создан");
      setCreateOpen(false);
      setCreateType("");
      setCreateCounterpartyId("");
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setCreating(false);
    }
  };

  const getFilterProps = () => {
    switch (tab) {
      case "incoming_payment": return { groupFilter: "", typeFilter: "incoming_payment" };
      case "outgoing_payment": return { groupFilter: "", typeFilter: "outgoing_payment" };
      default: return { groupFilter: "finance", typeFilter: "" };
    }
  };

  const filterProps = getFilterProps();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Финансы"
        actions={
          tab !== "reports" ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Новый платёж
            </Button>
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">Все платежи</TabsTrigger>
          <TabsTrigger value="incoming_payment">Входящие</TabsTrigger>
          <TabsTrigger value="outgoing_payment">Исходящие</TabsTrigger>
          <TabsTrigger value="reports">Отчёты</TabsTrigger>
        </TabsList>

        <TabsContent value="reports">
          <div className="space-y-4">
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

            {/* Report sub-tabs */}
            <Tabs value={reportTab} onValueChange={setReportTab}>
              <TabsList>
                <TabsTrigger value="cashflow">Денежный поток</TabsTrigger>
                <TabsTrigger value="pnl">Прибыль и убытки</TabsTrigger>
                <TabsTrigger value="balances">Взаиморасчёты</TabsTrigger>
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

              <TabsContent value="balances">
                {reportsLoading ? (
                  <div className="py-8 text-center text-muted-foreground">Загрузка...</div>
                ) : balances ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Дебиторская задолженность</CardTitle></CardHeader>
                        <CardContent><p className="text-2xl font-bold text-green-600">{formatRub(balances.totalReceivable)}</p></CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Кредиторская задолженность</CardTitle></CardHeader>
                        <CardContent><p className="text-2xl font-bold text-red-600">{formatRub(Math.abs(balances.totalPayable))}</p></CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Чистый баланс</CardTitle></CardHeader>
                        <CardContent>
                          <p className={`text-2xl font-bold ${balances.netBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {formatRub(balances.netBalance)}
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    {balances.receivable.length > 0 && (
                      <Card>
                        <CardHeader><CardTitle className="text-sm">Нам должны</CardTitle></CardHeader>
                        <CardContent>
                          <Table>
                            <TableHeader><TableRow><TableHead>Контрагент</TableHead><TableHead className="text-right">Сумма</TableHead></TableRow></TableHeader>
                            <TableBody>
                              {balances.receivable.map((b) => (
                                <TableRow key={b.id}>
                                  <TableCell>{b.counterparty.name}</TableCell>
                                  <TableCell className="text-right text-green-600">{formatRub(b.balanceRub)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    )}

                    {balances.payable.length > 0 && (
                      <Card>
                        <CardHeader><CardTitle className="text-sm">Мы должны</CardTitle></CardHeader>
                        <CardContent>
                          <Table>
                            <TableHeader><TableRow><TableHead>Контрагент</TableHead><TableHead className="text-right">Сумма</TableHead></TableRow></TableHeader>
                            <TableBody>
                              {balances.payable.map((b) => (
                                <TableRow key={b.id}>
                                  <TableCell>{b.counterparty.name}</TableCell>
                                  <TableCell className="text-right text-red-600">{formatRub(Math.abs(b.balanceRub))}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">Нет данных</div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </TabsContent>
      </Tabs>

      {/* Document list for non-reports tabs */}
      {tab !== "reports" && (
        <DocumentsTable
          key={`${refreshKey}-${tab}`}
          groupFilter={filterProps.groupFilter}
          defaultTypeFilter={filterProps.typeFilter}
        />
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Новый платёж</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Тип документа *</Label>
              <Select value={createType} onValueChange={setCreateType}>
                <SelectTrigger><SelectValue placeholder="Выберите тип" /></SelectTrigger>
                <SelectContent>
                  {FINANCE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {createType && (
              <div className="grid gap-2">
                <Label>Контрагент</Label>
                <Select value={createCounterpartyId} onValueChange={setCreateCounterpartyId}>
                  <SelectTrigger><SelectValue placeholder="Выберите контрагента" /></SelectTrigger>
                  <SelectContent>
                    {counterparties.map((cp) => (
                      <SelectItem key={cp.id} value={cp.id}>{cp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Отмена</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Создание..." : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
