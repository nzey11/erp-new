"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card, Tag, Modal, Input, Button } from "antd";
import { ERPTable } from "@/components/erp/erp-table";
import type { ERPColumn } from "@/components/erp/erp-table.types";
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

  const docsColumns: ERPColumn<CounterpartyDoc>[] = [
    { key: "number", dataIndex: "number", title: "Номер", render: (value) => <span className="font-mono text-sm">{value as string}</span> },
    { key: "type", dataIndex: "typeName", title: "Тип", render: (value) => <span className="text-sm">{value as string}</span> },
    { key: "date", dataIndex: "date", title: "Дата", render: (value) => <span className="text-sm">{new Date(value as string).toLocaleDateString("ru-RU")}</span> },
    { key: "totalAmount", dataIndex: "totalAmount", title: "Сумма", align: "right", render: (value) => <span className="font-semibold">{formatRub(value as number)}</span> },
    {
      key: "actions",
      title: "",
      width: 40,
      render: (_, doc) => (
        <Link href={`/documents/${doc.id}`}>
          <Button type="text" icon={<ExternalLink className="h-3.5 w-3.5" />} className="h-7 w-7" />
        </Link>
      ),
    },
  ];

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

  const getBalanceColumns = (colorClass: string): ERPColumn<Balance>[] => [
    {
      key: "counterparty",
      title: "Контрагент",
      render: (_, b) => (
        <Link href={`/counterparties/${b.counterparty.id}`} className="hover:underline text-primary font-medium">
          {b.counterparty.name}
        </Link>
      ),
    },
    {
      key: "type",
      title: "Тип",
      render: (_, b) => <Tag>{COUNTERPARTY_TYPE_LABELS[b.counterparty.type] ?? b.counterparty.type}</Tag>,
    },
    {
      key: "balance",
      dataIndex: "balanceRub",
      title: "Сумма",
      align: "right",
      render: (value) => <span className={`font-semibold ${colorClass}`}>{formatRub(Math.abs(value as number))}</span>,
    },
    {
      key: "actions",
      title: "",
      width: 40,
      render: (_, b) => (
        <Button
          type="text"
          icon={<FileText className="h-3.5 w-3.5" />}
          className="h-7 w-7"
          title="Документы контрагента"
          onClick={() => openDocs(b.counterparty)}
        />
      ),
    },
  ];

  const BalanceTable = ({ items, colorClass }: { items: Balance[]; colorClass: string }) => (
    <ERPTable
      data={items}
      columns={getBalanceColumns(colorClass)}
      rowKey="id"
      onRefresh={load}
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Взаиморасчёты"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }}>
            <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>На дату</span>
            <Input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="w-40"
            />
            {asOfDate && (
              <Button type="text" size="small" onClick={() => setAsOfDate("")}>
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
      <Modal
        open={docsOpen}
        onCancel={() => setDocsOpen(false)}
        footer={null}
        title={`Документы: ${docsCounterparty?.name}`}
        width={700}
      >
        {docsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : docs.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground text-sm">Подтверждённых документов нет</div>
        ) : (
          <ERPTable
            data={docs}
            columns={docsColumns}
            rowKey="id"
            onRefresh={() => { if (docsCounterparty) openDocs(docsCounterparty); }}
          />
        )}
      </Modal>
    </div>
  );
}
