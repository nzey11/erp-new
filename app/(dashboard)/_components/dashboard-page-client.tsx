"use client";

import Link from "next/link";
import { Card } from "antd";
import { PageHeader } from "@/components/shared/page-header";
import { formatRub } from "@/lib/shared/utils";
import {
  Package,
  FileText,
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertTriangle,
} from "lucide-react";
import type { DashboardSummary } from "@/lib/modules/dashboard/types";

interface DashboardPageClientProps {
  summary: DashboardSummary;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  incoming_shipment: "Поступление",
  outgoing_shipment: "Отгрузка",
  supplier_return: "Возврат поставщику",
  customer_return: "Возврат от покупателя",
  inventory: "Инвентаризация",
  write_off: "Списание",
};

const DOC_STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  confirmed: "Проведён",
  cancelled: "Отменён",
};

export function DashboardPageClient({ summary }: DashboardPageClientProps) {
  const kpiCards = [
    {
      title: "Стоимость склада",
      value: formatRub(summary.stockValue),
      icon: Package,
      href: "/stock",
      color: "text-blue-600",
    },
    {
      title: "Выручка (мес.)",
      value: formatRub(summary.revenueMonth),
      icon: TrendingUp,
      href: "/sales",
      color: "text-green-600",
    },
    {
      title: "Ожидают проведения",
      value: summary.pendingDocuments,
      icon: FileText,
      href: "/purchases",
      color: "text-orange-600",
    },
    {
      title: "Позиций без остатка",
      value: summary.lowStockAlerts,
      icon: AlertTriangle,
      href: "/stock",
      color: "text-red-600",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Панель управления"
        description="Сводная информация по всем модулям системы"
      />

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((card) => (
          <Link key={card.title} href={card.href} className="block hover:opacity-80 transition-opacity">
            <Card className="cursor-pointer hover:shadow-md transition-shadow" title={
              <span className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                {card.title}
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </span>
            }>
              <div className={`text-2xl font-bold ${card.color}`}>
                {card.value}
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Cash Flow Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card title={
          <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-500" />
            Поступления (мес.)
          </span>
        }>
          <p className="text-2xl font-bold text-green-600">
            {formatRub(summary.cashFlow.cashIn)}
          </p>
        </Card>

        <Card title={
          <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-red-500" />
            Выплаты (мес.)
          </span>
        }>
          <p className="text-2xl font-bold text-red-600">
            {formatRub(summary.cashFlow.cashOut)}
          </p>
        </Card>

        <Card title={
          <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Wallet className="h-4 w-4 text-blue-500" />
            Чистый поток (мес.)
          </span>
        }>
          <p className={`text-2xl font-bold ${summary.cashFlow.netCashFlow >= 0 ? "text-green-600" : "text-red-600"}`}>
            {formatRub(summary.cashFlow.netCashFlow)}
          </p>
        </Card>
      </div>

      {/* Recent Documents */}
      {summary.recentDocuments.length > 0 && (
        <Card title={<span className="text-base">Последние документы</span>}>
          <div className="space-y-2">
              {summary.recentDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-medium">{doc.number}</span>
                    <span className="text-sm text-muted-foreground">
                      {DOC_TYPE_LABELS[doc.type] ?? doc.type}
                    </span>
                    {doc.counterpartyName && (
                      <span className="text-sm text-muted-foreground">— {doc.counterpartyName}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {DOC_STATUS_LABELS[doc.status] ?? doc.status}
                    </span>
                    <span className="text-sm font-medium">
                      {formatRub(doc.totalAmount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
        </Card>
      )}

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="hover:border-primary/40 transition-colors cursor-pointer" title={<span className="text-base">Закупки</span>}>
          <Link href="/purchases">
            <div className="text-sm text-muted-foreground">
              Создать поступление товаров, управлять поставщиками.
            </div>
          </Link>
        </Card>
        <Card className="hover:border-primary/40 transition-colors cursor-pointer" title={<span className="text-base">Платежи</span>}>
          <Link href="/finance/payments">
            <div className="text-sm text-muted-foreground">
              Зарегистрировать доходы и расходы, отслеживать движение средств.
            </div>
          </Link>
        </Card>
        <Card className="hover:border-primary/40 transition-colors cursor-pointer" title={<span className="text-base">Отчёты</span>}>
          <Link href="/finance/reports">
            <div className="text-sm text-muted-foreground">
              Прибыли и убытки, ДДС, баланс активов и пассивов.
            </div>
          </Link>
        </Card>
      </div>
    </div>
  );
}
