"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

export default function BalancesPage() {
  const [balances, setBalances] = useState<BalancesReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/finance/reports/balances")
      .then((res) => res.json())
      .then((data) => setBalances(data))
      .catch(() => toast.error("Ошибка загрузки балансов"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Взаиморасчёты" />
        <div className="py-8 text-center text-muted-foreground">Загрузка...</div>
      </div>
    );
  }

  if (!balances) {
    return (
      <div className="space-y-6">
        <PageHeader title="Взаиморасчёты" />
        <div className="py-8 text-center text-muted-foreground">Нет данных</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Взаиморасчёты" />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Дебиторская задолженность</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{formatRub(balances.totalReceivable)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Кредиторская задолженность</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{formatRub(Math.abs(balances.totalPayable))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Чистый баланс</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${balances.netBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatRub(balances.netBalance)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Receivable Table */}
      {balances.receivable.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Нам должны</CardTitle>
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

      {/* Payable Table */}
      {balances.payable.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Мы должны</CardTitle>
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

      {balances.receivable.length === 0 && balances.payable.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          Нет данных о взаиморасчётах
        </Card>
      )}
    </div>
  );
}
