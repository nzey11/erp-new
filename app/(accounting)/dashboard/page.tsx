"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "antd";
import { PageHeader } from "@/components/shared/page-header";
import { formatRub } from "@/lib/shared/utils";
import {
  Package,
  Users,
  FileText,
  Warehouse,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Boxes,
} from "lucide-react";

interface TrendMetric {
  amount: number;
  count: number;
  delta: number | null;
}

interface TrendsData {
  currentMonth: { label: string; sales: TrendMetric; purchases: TrendMetric };
  previousMonth: { label: string; sales: TrendMetric; purchases: TrendMetric };
}

interface DashboardData {
  products: number;
  counterparties: number;
  warehouses: number;
  documents: { total: number; drafts: number };
  stock: { totalItems: number; totalCostValue: number };
  balances: { totalReceivable: number; totalPayable: number };
}

export default function AccountingDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [trends, setTrends] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [productsRes, counterpartiesRes, warehousesRes, docsRes, stockRes, balancesRes, trendsRes] =
          await Promise.all([
            fetch("/api/accounting/products?limit=1"),
            fetch("/api/accounting/counterparties?limit=1"),
            fetch("/api/accounting/warehouses"),
            fetch("/api/accounting/documents?limit=1"),
            fetch("/api/accounting/stock"),
            fetch("/api/accounting/reports/balances"),
            fetch("/api/accounting/dashboard/trends"),
          ]);

        const products = await productsRes.json();
        const counterparties = await counterpartiesRes.json();
        const warehouses = await warehousesRes.json();
        const docs = await docsRes.json();
        const stock = await stockRes.json();
        const balances = await balancesRes.json();
        if (trendsRes.ok) setTrends(await trendsRes.json());

        setData({
          products: products.total ?? 0,
          counterparties: counterparties.total ?? 0,
          warehouses: Array.isArray(warehouses) ? warehouses.length : 0,
          documents: {
            total: docs.total ?? 0,
            drafts: 0,
          },
          stock: {
            totalItems: Array.isArray(stock.records) ? stock.records.length : 0,
            totalCostValue: stock.totals?.totalCostValue ?? 0,
          },
          balances: {
            totalReceivable: balances.totalReceivable ?? 0,
            totalPayable: balances.totalPayable ?? 0,
          },
        });
      } catch (e) {
        console.error("Dashboard load error:", e);
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Учёт — Панель" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <div className="pb-2">
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
              </div>
              <div>
                <div className="h-8 w-16 bg-muted animate-pulse rounded" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const stats = [
    {
      title: "Товары",
      value: data?.products ?? 0,
      icon: Package,
      href: "/products",
    },
    {
      title: "Контрагенты",
      value: data?.counterparties ?? 0,
      icon: Users,
      href: "/counterparties",
    },
    {
      title: "Склады",
      value: data?.warehouses ?? 0,
      icon: Warehouse,
      href: "/warehouses",
    },
    {
      title: "Документы",
      value: data?.documents.total ?? 0,
      icon: FileText,
      href: "/documents",
    },
    {
      title: "SKU на складах",
      value: data?.stock.totalItems ?? 0,
      icon: Boxes,
      href: "/stock",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Учёт — Панель" description="Обзор состояния системы учёта" />

      {/* Key metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <Link key={stat.title} href={stat.href} className="block hover:opacity-80 transition-opacity">
            <Card className="cursor-pointer hover:shadow-md transition-shadow" title={
              <span className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                {stat.title}
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </span>
            }>
              <div className="text-2xl font-bold">{stat.value}</div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Trend cards: current month vs previous */}
      {trends && (
        <div className="grid gap-4 md:grid-cols-2">
          <Link href="/sales" className="block hover:opacity-80 transition-opacity">
            <Card className="cursor-pointer hover:shadow-md transition-shadow" title={
              <span className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                Продажи за {trends.currentMonth.label}
                <TrendingUp className="h-4 w-4 text-green-600" />
              </span>
            }>
              <p className="text-2xl font-bold">{formatRub(trends.currentMonth.sales.amount)}</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xs text-muted-foreground">{trends.currentMonth.sales.count} отгрузок</p>
                {trends.currentMonth.sales.delta !== null && (
                  <span className={`text-xs font-medium ${trends.currentMonth.sales.delta >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {trends.currentMonth.sales.delta >= 0 ? "+" : ""}{trends.currentMonth.sales.delta.toFixed(1)}% прошлый мес.
                  </span>
                )}
              </div>
            </Card>
          </Link>
          <Link href="/purchases" className="block hover:opacity-80 transition-opacity">
            <Card className="cursor-pointer hover:shadow-md transition-shadow" title={
              <span className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                Закупки за {trends.currentMonth.label}
                <TrendingDown className="h-4 w-4 text-blue-600" />
              </span>
            }>
              <p className="text-2xl font-bold">{formatRub(trends.currentMonth.purchases.amount)}</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xs text-muted-foreground">{trends.currentMonth.purchases.count} приёмок</p>
                {trends.currentMonth.purchases.delta !== null && (
                  <span className={`text-xs font-medium ${trends.currentMonth.purchases.delta <= 0 ? "text-green-600" : "text-amber-600"}`}>
                    {trends.currentMonth.purchases.delta >= 0 ? "+" : ""}{trends.currentMonth.purchases.delta.toFixed(1)}% прошлый мес.
                  </span>
                )}
              </div>
            </Card>
          </Link>
        </div>
      )}

      {/* Financial summary */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card title={
          <span className="text-sm font-medium text-muted-foreground flex items-center justify-between">
            Дебиторская задолженность
            <TrendingUp className="h-4 w-4 text-green-600" />
          </span>
        }>
          <div className="flex items-center gap-2">
            <ArrowUpRight className="h-4 w-4 text-green-600" />
            <span className="text-2xl font-bold text-green-600">
              {formatRub(data?.balances.totalReceivable ?? 0)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Нам должны</p>
        </Card>

        <Card title={
          <span className="text-sm font-medium text-muted-foreground flex items-center justify-between">
            Кредиторская задолженность
            <TrendingDown className="h-4 w-4 text-red-600" />
          </span>
        }>
          <div className="flex items-center gap-2">
            <ArrowDownRight className="h-4 w-4 text-red-600" />
            <span className="text-2xl font-bold text-red-600">
              {formatRub(data?.balances.totalPayable ?? 0)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Мы должны</p>
        </Card>
      </div>

      {/* Stock cost value */}
      <Link href="/stock" className="block hover:opacity-80 transition-opacity">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" title={
          <span className="text-sm font-medium text-muted-foreground">
            Стоимость товарных запасов
          </span>
        }>
          <p className="text-2xl font-bold">{formatRub(data?.stock.totalCostValue ?? 0)}</p>
          <p className="text-xs text-muted-foreground mt-1">По средней себестоимости</p>
        </Card>
      </Link>
    </div>
  );
}
