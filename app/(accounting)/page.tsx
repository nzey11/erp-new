"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
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
} from "lucide-react";

interface DashboardData {
  products: number;
  counterparties: number;
  warehouses: number;
  documents: { total: number; drafts: number };
  stock: { totalItems: number };
  balances: { totalReceivable: number; totalPayable: number };
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [productsRes, counterpartiesRes, warehousesRes, docsRes, stockRes, balancesRes] =
          await Promise.all([
            fetch("/api/accounting/products?limit=1"),
            fetch("/api/accounting/counterparties?limit=1"),
            fetch("/api/accounting/warehouses"),
            fetch("/api/accounting/documents?limit=1"),
            fetch("/api/accounting/stock"),
            fetch("/api/accounting/reports/balances"),
          ]);

        const products = await productsRes.json();
        const counterparties = await counterpartiesRes.json();
        const warehouses = await warehousesRes.json();
        const docs = await docsRes.json();
        const stock = await stockRes.json();
        const balances = await balancesRes.json();

        setData({
          products: products.total ?? 0,
          counterparties: counterparties.total ?? 0,
          warehouses: Array.isArray(warehouses) ? warehouses.length : 0,
          documents: {
            total: docs.total ?? 0,
            drafts: 0,
          },
          stock: {
            totalItems: stock.totals?.length ?? 0,
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
        <PageHeader title="Панель управления" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-16 bg-muted animate-pulse rounded" />
              </CardContent>
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
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Панель управления" description="Обзор состояния системы" />

      {/* Key metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Financial summary */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Дебиторская задолженность
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-green-600" />
              <span className="text-2xl font-bold text-green-600">
                {formatRub(data?.balances.totalReceivable ?? 0)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Нам должны</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Кредиторская задолженность
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <ArrowDownRight className="h-4 w-4 text-red-600" />
              <span className="text-2xl font-bold text-red-600">
                {formatRub(data?.balances.totalPayable ?? 0)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Мы должны</p>
          </CardContent>
        </Card>
      </div>

      {/* Stock summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Остатки на складах
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{data?.stock.totalItems ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Товаров с ненулевыми остатками</p>
        </CardContent>
      </Card>
    </div>
  );
}
