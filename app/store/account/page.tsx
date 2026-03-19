"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShoppingBag, Heart, MapPin, LogOut, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tag } from "antd";
import { formatRub, formatDate } from "@/lib/shared/utils";
import { toast } from "sonner";
import { ProfileEditForm } from "@/components/domain/ecommerce/ProfileEditForm";

type Customer = {
  id: string;
  name: string | null;
  telegramUsername: string | null;
  email: string | null;
  phone: string | null;
};

type RecentOrder = {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
};

const statusLabels: Record<string, string> = {
  pending: "Ожидает оплаты",
  paid: "Оплачен",
  processing: "Комплектуется",
  shipped: "Отправлен",
  delivered: "Доставлен",
  cancelled: "Отменён",
};

const statusColors: Record<string, string> = {
  pending: "orange",
  paid: "blue",
  processing: "purple",
  shipped: "geekblue",
  delivered: "green",
  cancelled: "red",
};

export default function AccountPage() {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [customerRes, ordersRes] = await Promise.all([
          fetch("/api/auth/customer/me"),
          fetch("/api/ecommerce/orders?limit=3"),
        ]);

        if (!customerRes.ok) {
          router.push("/store/register");
          return;
        }

        const customerData = await customerRes.json();
        setCustomer(customerData);

        if (ordersRes.ok) {
          const ordersData = await ordersRes.json();
          setRecentOrders(ordersData.orders || []);
        }
      } catch (error) {
        console.error("Failed to fetch account data:", error);
        toast.error("Не удалось загрузить данные");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/customer/logout", { method: "POST" });
      if (res.ok) {
        toast.success("Вы вышли из аккаунта");
        router.push("/store/catalog");
      }
    } catch (error) {
      console.error("Logout error:", error);
      toast.error("Ошибка выхода");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/4" />
        <div className="grid md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-6">
              <div className="h-24 bg-muted rounded" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!customer) {
    return null;
  }

  const displayName = customer.name || customer.telegramUsername || "Покупатель";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Личный кабинет</h1>
          <p className="text-muted-foreground">Добро пожаловать, {displayName}!</p>
        </div>
        <Button variant="outline" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-2" />
          Выйти
        </Button>
      </div>

      {/* Quick Links */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link href="/store/account/orders">
          <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer h-full">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <ShoppingBag className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Мои заказы</h3>
                <p className="text-sm text-muted-foreground">История покупок</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link href="/store/account/favorites">
          <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer h-full">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-100">
                <Heart className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold">Избранное</h3>
                <p className="text-sm text-muted-foreground">Сохранённые товары</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link href="/store/account/addresses">
          <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer h-full">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
                <MapPin className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold">Адреса</h3>
                <p className="text-sm text-muted-foreground">Адреса доставки</p>
              </div>
            </div>
          </Card>
        </Link>
      </div>

      {/* Contact Info - Editable */}
      <ProfileEditForm customer={customer} onUpdate={setCustomer} />

      {/* Recent Orders */}
      {recentOrders.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Последние заказы</h2>
            <Link href="/store/account/orders">
              <Button variant="ghost" size="sm">
                Все заказы →
              </Button>
            </Link>
          </div>
          <div className="space-y-4">
            {recentOrders.map((order) => (
              <Card key={order.id} className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                      <Package className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Заказ #{order.orderNumber}</h3>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(order.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Tag color={statusColors[order.status] ?? ""}>
                      {statusLabels[order.status] || order.status}
                    </Tag>
                    <p className="text-lg font-bold mt-2">
                      {formatRub(order.totalAmount)}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
