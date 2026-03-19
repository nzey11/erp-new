"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "antd";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tag } from "antd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, FileText, ExternalLink } from "lucide-react";
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

interface CounterpartyDoc {
  id: string;
  number: string;
  type: string;
  typeName: string;
  date: string;
  totalAmount: number;
  status: string;
  statusName: string;
}

const COUNTERPARTY_TYPE_LABELS: Record<string, string> = {
  supplier: "Поставщик",
  customer: "Покупатель",
  both: "Поставщик+Покупатель",
};

export default function BalancesPage() {
  const [balances, setBalances] = useState<BalancesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [asOfDate, setAsOfDate] = useState("");

  // Document drill-down dialog
  const [docsOpen, setDocsOpen] = useState(false);
  const [docsCounterparty, setDocsCounterparty] = useState<{ id: string; name: string } | null>(null);
  const [docs, setDocs] = useState<CounterpartyDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (asOfDate) params.set("asOfDate", asOfDate);
      const res = await fetch(`/api/finance/reports/balances?${params}`);
      const data = await res.json();
      setBalances({
        balances: data.balances ?? [],
        receivable: data.receivable ?? [],
        payable: data.payable ?? [],
        totalReceivable: data.totalReceivable ?? 0,
        totalPayable: data.totalPayable ?? 0,
        netBalance: data.netBalance ?? 0,
      });
    } catch {
      toast.error("Ошибка загрузки балансов");
    } finally {
      setLoading(false);
    }
  }, [asOfDate]);

  useEffect(() => { load(); }, [load]);

  const openDocs = async (cp: { id: string; name: string }) => {
    setDocsCounterparty(cp);
    setDocsOpen(true);
    setDocsLoading(true);
    setDocs([]);
    try {
      const params = new URLSearchParams({ counterpartyId: cp.id, status: "confirmed", limit: "100" });
      const res = await fetch(`/api/accounting/documents?${params}`);
      const data = await res.json();
      setDocs(Array.isArray(data) ? data : (data.documents ?? data.data ?? []));
    } catch {
      toast.error("Ошибка загрузки документов");
    } finally {
      setDocsLoading(false);
    }
  };

  const BalanceTable = ({ items, colorClass }: { items: Balance[]; colorClass: string }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Контрагент</TableHead>
          <TableHead>Тип</TableHead>
          <TableHead className="text-right">Сумма</TableHead>
          <TableHead className="w-10"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((b) => (
          <TableRow key={b.id}>
            <TableCell className="font-medium">
              <Link
                href={`/counterparties/${b.counterparty.id}`}
                className="hover:underline text-primary"
              >
                {b.counterparty.name}
              </Link>
            </TableCell>
            <TableCell>
              <Tag>
                {COUNTERPARTY_TYPE_LABELS[b.counterparty.type] ?? b.counterparty.type}
              </Tag>
            </TableCell>
            <TableCell className={`text-right font-semibold ${colorClass}`}>
              {formatRub(Math.abs(b.balanceRub))}
            </TableCell>
            <TableCell>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Документы контрагента"
                onClick={() => openDocs(b.counterparty)}
              >
                <FileText className="h-3.5 w-3.5" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Взаиморасчёты"
        actions={
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">На дату</Label>
            <Input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="w-40"
            />
            {asOfDate && (
              <Button variant="ghost" size="sm" onClick={() => setAsOfDate("")}>
                Сбросить
              </Button>
            )}
          </div>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !balances ? (
        <div className="py-8 text-center text-muted-foreground">Нет данных</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card title={<span className="text-sm text-muted-foreground">Дебиторская задолженность</span>}>
              <p className="text-2xl font-bold text-green-600">{formatRub(balances.totalReceivable)}</p>
              <p className="text-xs text-muted-foreground mt-1">нам должны — {balances.receivable.length} контрагентов</p>
            </Card>
            <Card title={<span className="text-sm text-muted-foreground">Кредиторская задолженность</span>}>
              <p className="text-2xl font-bold text-red-600">{formatRub(Math.abs(balances.totalPayable))}</p>
              <p className="text-xs text-muted-foreground mt-1">мы должны — {balances.payable.length} контрагентам</p>
            </Card>
            <Card title={<span className="text-sm text-muted-foreground">Чистый баланс</span>}>
              <p className={`text-2xl font-bold ${balances.netBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatRub(balances.netBalance)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">дебиторская − кредиторская</p>
            </Card>
          </div>

          {/* Receivable Table */}
          {balances.receivable.length > 0 && (
            <Card title={<span className="text-lg text-green-700">Нам должны ({balances.receivable.length})</span>}>
              <BalanceTable items={balances.receivable} colorClass="text-green-600" />
            </Card>
          )}

          {/* Payable Table */}
          {balances.payable.length > 0 && (
            <Card title={<span className="text-lg text-red-700">Мы должны ({balances.payable.length})</span>}>
              <BalanceTable items={balances.payable} colorClass="text-red-600" />
            </Card>
          )}

          {balances.receivable.length === 0 && balances.payable.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">
              Нет данных о взаиморасчётах
            </Card>
          )}
        </>
      )}

      {/* Documents Drill-down Dialog */}
      <Dialog open={docsOpen} onOpenChange={setDocsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Документы: {docsCounterparty?.name}</DialogTitle>
          </DialogHeader>
          {docsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : docs.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground text-sm">Подтверждённых документов нет</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Номер</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Дата</TableHead>
                  <TableHead className="text-right">Сумма</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-mono text-sm">{doc.number}</TableCell>
                    <TableCell className="text-sm">{doc.typeName}</TableCell>
                    <TableCell className="text-sm">{new Date(doc.date).toLocaleDateString("ru-RU")}</TableCell>
                    <TableCell className="text-right font-semibold">{formatRub(doc.totalAmount)}</TableCell>
                    <TableCell>
                      <Link href={`/documents/${doc.id}`}>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
