"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDataGrid } from "@/lib/hooks/use-data-grid";
import { ChevronDown, ChevronRight } from "lucide-react";

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

function EntryRow({ entry }: { entry: JournalEntry }) {
  const [expanded, setExpanded] = useState(false);

  const debits = entry.lines.filter((l) => l.debit > 0);
  const credits = entry.lines.filter((l) => l.credit > 0);
  const maxLen = Math.max(debits.length, credits.length);
  const pairs = Array.from({ length: maxLen }, (_, i) => ({
    debit: debits[i],
    credit: credits[i],
  }));

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
            {entry.isManual && <Badge variant="outline">Ручная</Badge>}
            {entry.isReversed && <Badge variant="secondary">Сторно</Badge>}
            {entry.sourceNumber && (
              <Badge variant="default" className="text-xs">
                {entry.sourceType?.slice(0, 3).toUpperCase()} {entry.sourceNumber}
              </Badge>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/30">
          <td colSpan={5} className="px-6 py-3">
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
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const [dateFrom, setDateFrom] = useState(firstDay.toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(today.toISOString().slice(0, 10));
  const [applied, setApplied] = useState({ dateFrom: firstDay.toISOString().slice(0, 10), dateTo: today.toISOString().slice(0, 10) });

  const grid = useDataGrid<JournalEntry>({
    endpoint: `/api/accounting/journal?dateFrom=${applied.dateFrom}&dateTo=${applied.dateTo}`,
    enablePagination: true,
    enableSearch: false,
    responseAdapter: (json: unknown) => {
      const j = json as { entries: JournalEntry[]; total: number };
      return { data: j.entries ?? [], total: j.total ?? 0 };
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Журнал проводок"
        description="Двойная запись — все хозяйственные операции"
      />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-3">
          <CardTitle>Проводки ({grid.total})</CardTitle>
          <div className="flex items-center gap-2 ml-auto">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-40"
            />
            <span className="text-muted-foreground">—</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-40"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setApplied({ dateFrom, dateTo })}
            >
              Применить
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {grid.loading ? (
            <div className="py-8 text-center text-muted-foreground">Загрузка...</div>
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
                    <th className="text-left px-3 py-2">Теги</th>
                  </tr>
                </thead>
                <tbody>
                  {grid.data.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
