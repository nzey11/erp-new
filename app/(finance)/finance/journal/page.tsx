"use client";

import { useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Tag } from "antd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDataGrid } from "@/lib/hooks/use-data-grid";
import { ChevronDown, ChevronRight, RotateCcw, AlertTriangle, Loader2 } from "lucide-react";
import Link from "next/link";
import { formatRub } from "@/lib/shared/utils";
import { toast } from "sonner";

interface LedgerLine {
  account: { code: string; name: string };
  debit: number;
  credit: number;
}

interface JournalEntry {
  id: string;
  number: string;
  date: string;
  description: string | null;
  sourceType: string | null;
  sourceId: string | null;
  sourceNumber: string | null;
  isManual: boolean;
  isReversed: boolean;
  lines: LedgerLine[];
}

function formatAmount(n: number): string {
  if (!n || n === 0) return "—";
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2 }).format(n);
}

function formatDate(s: string): string {
  return new Date(s).toLocaleDateString("ru-RU");
}

// Document source types that link to /documents/:id
const DOC_SOURCE_TYPES = new Set([
  "outgoing_shipment", "incoming_shipment", "customer_return",
  "supplier_return", "stock_receipt", "write_off", "inventory_count",
  "purchase_order", "internal_transfer",
]);

const SOURCE_TYPE_LABELS: Record<string, string> = {
  outgoing_shipment: "Отгрузка",
  incoming_shipment: "Приёмка",
  customer_return: "Возврат покупателя",
  supplier_return: "Возврат поставщику",
  stock_receipt: "Оприходование",
  write_off: "Списание",
  inventory_count: "Инвентаризация",
  purchase_order: "Заказ поставщику",
  internal_transfer: "Перемещение",
  finance_payment: "Платёж",
  unknown: "Документ",
};

function EntryRow({
  entry,
  onReverse,
}: {
  entry: JournalEntry;
  onReverse: (entry: JournalEntry) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const debits = entry.lines.filter((l) => l.debit > 0);
  const credits = entry.lines.filter((l) => l.credit > 0);
  const maxLen = Math.max(debits.length, credits.length);
  const pairs = Array.from({ length: maxLen }, (_, i) => ({
    debit: debits[i],
    credit: credits[i],
  }));

  const totalAmount = entry.lines.reduce((s, l) => s + l.debit, 0);

  const sourceLabel = entry.sourceType ? (SOURCE_TYPE_LABELS[entry.sourceType] ?? entry.sourceType) : null;
  const sourceIsDoc = entry.sourceType ? DOC_SOURCE_TYPES.has(entry.sourceType) : false;
  const sourceIsPayment = entry.sourceType === "finance_payment";

  return (
    <>
      <tr
        className="border-b hover:bg-muted/50 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-3 py-2 w-8">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </td>
        <td className="px-3 py-2 font-mono text-sm">{entry.number}</td>
        <td className="px-3 py-2 text-sm">{formatDate(entry.date)}</td>
        <td className="px-3 py-2 text-sm text-muted-foreground max-w-xs truncate">
          {entry.description ?? "—"}
        </td>
        <td className="px-3 py-2">
          <div className="flex gap-1 flex-wrap">
            {entry.isManual && <Tag>Ручная</Tag>}
            {entry.isReversed && <Tag color="default">Сторно</Tag>}
            {sourceLabel && entry.sourceNumber && (
              <>
                {sourceIsDoc && entry.sourceId ? (
                  <Link
                    href={`/documents/${entry.sourceId}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Tag color="blue" className="text-xs cursor-pointer">
                      {sourceLabel} №{entry.sourceNumber}
                    </Tag>
                  </Link>
                ) : sourceIsPayment ? (
                  <Link
                    href="/finance/payments"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Tag color="blue" className="text-xs cursor-pointer">
                      {sourceLabel} №{entry.sourceNumber}
                    </Tag>
                  </Link>
                ) : (
                  <Tag color="blue" className="text-xs">
                    {sourceLabel} №{entry.sourceNumber}
                  </Tag>
                )}
              </>
            )}
          </div>
        </td>
        <td className="px-3 py-2 text-right font-mono text-sm font-semibold">
          {formatAmount(totalAmount)}
        </td>
        <td className="px-3 py-2 w-10" onClick={(e) => e.stopPropagation()}>
          {!entry.isReversed && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              title="Сторнировать проводку"
              onClick={() => onReverse(entry)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/30">
          <td colSpan={7} className="px-6 py-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-xs border-b">
                  <th className="text-left pb-1 w-1/2">Дебет</th>
                  <th className="text-left pb-1 w-1/2">Кредит</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((pair, i) => (
                  <tr key={i} className="border-b border-muted last:border-0">
                    <td className="py-1 pr-4">
                      {pair.debit && (
                        <span>
                          <span className="font-mono font-semibold">{pair.debit.account.code}</span>{" "}
                          <span className="text-muted-foreground">{pair.debit.account.name}</span>{" "}
                          <span className="font-semibold text-green-700 ml-2">
                            {formatAmount(pair.debit.debit)}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="py-1">
                      {pair.credit && (
                        <span>
                          <span className="font-mono font-semibold">{pair.credit.account.code}</span>{" "}
                          <span className="text-muted-foreground">{pair.credit.account.name}</span>{" "}
                          <span className="font-semibold text-red-700 ml-2">
                            {formatAmount(pair.credit.credit)}
                          </span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

export default function JournalPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    }>
      <JournalPageContent />
    </Suspense>
  );
}

function JournalPageContent() {
  const searchParams = useSearchParams();
  const urlAccountCode = searchParams.get("accountCode") ?? "";

  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const [dateFrom, setDateFrom] = useState(firstDay.toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(today.toISOString().slice(0, 10));
  const [applied, setApplied] = useState({
    dateFrom: firstDay.toISOString().slice(0, 10),
    dateTo: today.toISOString().slice(0, 10),
    isManual: "all",
    accountCode: urlAccountCode,
  });

  const [isManualFilter, setIsManualFilter] = useState("all");
  const [accountCode, setAccountCode] = useState(urlAccountCode);

  // Reverse confirm dialog
  const [reverseTarget, setReverseTarget] = useState<JournalEntry | null>(null);
  const [reverseOpen, setReverseOpen] = useState(false);
  const [reversing, setReversing] = useState(false);

  const buildEndpoint = useCallback(() => {
    const p = new URLSearchParams({
      dateFrom: applied.dateFrom,
      dateTo: applied.dateTo,
    });
    if (applied.isManual === "manual") p.set("isManual", "true");
    if (applied.isManual === "auto") p.set("isManual", "false");
    if (applied.accountCode) p.set("accountCode", applied.accountCode);
    return `/api/accounting/journal?${p}`;
  }, [applied]);

  const grid = useDataGrid<JournalEntry>({
    endpoint: buildEndpoint(),
    enablePagination: true,
    enableSearch: false,
    responseAdapter: (json: unknown) => {
      const j = json as { entries: JournalEntry[]; total: number };
      return { data: j.entries ?? [], total: j.total ?? 0 };
    },
  });

  const handleApply = () => {
    setApplied({ dateFrom, dateTo, isManual: isManualFilter, accountCode });
  };

  const openReverse = (entry: JournalEntry) => {
    setReverseTarget(entry);
    setReverseOpen(true);
  };

  const handleReverse = async () => {
    if (!reverseTarget) return;
    setReversing(true);
    try {
      const res = await fetch(`/api/accounting/journal/${reverseTarget.id}/reverse`, {
        method: "POST",
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(`Сторно создано для проводки ${reverseTarget.number}`);
      setReverseOpen(false);
      setReverseTarget(null);
      grid.mutate.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setReversing(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Журнал проводок"
        description="Двойная запись — все хозяйственные операции"
      />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-end gap-3 pb-3">
          <CardTitle className="mr-auto">Проводки ({grid.total})</CardTitle>

          {/* Date range */}
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-38"
            />
            <span className="text-muted-foreground">—</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-38"
            />
          </div>

          {/* Manual / Auto filter */}
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">Тип</Label>
            <Select value={isManualFilter} onValueChange={setIsManualFilter}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все проводки</SelectItem>
                <SelectItem value="manual">Только ручные</SelectItem>
                <SelectItem value="auto">Только авто</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Account code filter */}
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">Счёт</Label>
            <Input
              placeholder="Например: 51"
              value={accountCode}
              onChange={(e) => setAccountCode(e.target.value)}
              className="w-28 h-9"
              onKeyDown={(e) => e.key === "Enter" && handleApply()}
            />
          </div>

          <Button variant="outline" size="sm" onClick={handleApply}>
            Применить
          </Button>
        </CardHeader>

        <CardContent>
          {grid.loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : grid.data.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              Нет проводок за выбранный период
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="w-8" />
                    <th className="text-left px-3 py-2">Номер</th>
                    <th className="text-left px-3 py-2">Дата</th>
                    <th className="text-left px-3 py-2">Описание</th>
                    <th className="text-left px-3 py-2">Источник</th>
                    <th className="text-right px-3 py-2">Сумма</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {grid.data.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} onReverse={openReverse} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reverse Confirmation Dialog */}
      <Dialog open={reverseOpen} onOpenChange={(o) => { setReverseOpen(o); if (!o) setReverseTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Сторнировать проводку?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Проводка{" "}
            <span className="font-mono font-semibold">{reverseTarget?.number}</span> от{" "}
            {reverseTarget ? formatDate(reverseTarget.date) : ""} на сумму{" "}
            <span className="font-semibold">
              {reverseTarget ? formatRub(reverseTarget.lines.reduce((s, l) => s + l.debit, 0)) : ""}
            </span>{" "}
            будет сторнирована — создана обратная запись. Исходная проводка останется.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReverseOpen(false); setReverseTarget(null); }}>
              Отмена
            </Button>
            <Button variant="destructive" onClick={handleReverse} disabled={reversing}>
              {reversing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Создание...</> : "Сторнировать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
