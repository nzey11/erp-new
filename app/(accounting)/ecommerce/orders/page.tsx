"use client";

import React, { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn, formatRub, formatDateTime } from "@/lib/shared/utils";

type OrderStatus = "pending" | "paid" | "processing" | "shipped" | "delivered" | "cancelled";
type DeliveryType = "pickup" | "courier";

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  price: number;
  total: number;
  product: {
    name: string;
    sku: string | null;
  };
  variant: {
    id: string;
    option: { value: string };
  } | null;
}

interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  totalAmount: number;
  deliveryType: DeliveryType;
  createdAt: string;
  customer: {
    name: string | null;
    phone: string | null;
    telegramUsername: string | null;
  };
  items: OrderItem[];
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Ожидает оплаты",
  paid: "Оплачен",
  processing: "Комплектуется",
  shipped: "Отправлен",
  delivered: "Доставлен",
  cancelled: "Отменён",
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  paid: "bg-blue-100 text-blue-800 border-blue-300",
  processing: "bg-orange-100 text-orange-800 border-orange-300",
  shipped: "bg-purple-100 text-purple-800 border-purple-300",
  delivered: "bg-green-100 text-green-800 border-green-300",
  cancelled: "bg-red-100 text-red-800 border-red-300",
};

const DELIVERY_TYPE_LABELS: Record<DeliveryType, string> = {
  pickup: "Самовывоз",
  courier: "Курьерская доставка",
};

export default function EcommerceOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/accounting/ecommerce/orders");
      if (!res.ok) throw new Error("Ошибка загрузки заказов");
      const data = await res.json();
      setOrders(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    setUpdatingStatus(orderId);
    try {
      const res = await fetch(`/api/accounting/ecommerce/orders/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка обновления статуса");
      }

      toast.success("Статус заказа обновлён");
      await loadOrders();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка");
    } finally {
      setUpdatingStatus(null);
    }
  };

  const toggleExpanded = (orderId: string) => {
    const newExpanded = new Set(expandedOrders);
    if (newExpanded.has(orderId)) {
      newExpanded.delete(orderId);
    } else {
      newExpanded.add(orderId);
    }
    setExpandedOrders(newExpanded);
  };

  const filteredOrders = statusFilter === "all"
    ? orders
    : orders.filter((order) => order.status === statusFilter);

  const getCustomerDisplay = (order: Order) => {
    if (order.customer.name) return order.customer.name;
    if (order.customer.phone) return order.customer.phone;
    if (order.customer.telegramUsername) return `@${order.customer.telegramUsername}`;
    return "Не указано";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Заказы интернет-магазина"
        description="Управление заказами покупателей"
      />

      {/* Status filter */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium">Статус:</label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все заказы</SelectItem>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Orders table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead>№ Заказа</TableHead>
              <TableHead>Покупатель</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Доставка</TableHead>
              <TableHead className="text-right">Сумма</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead>Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8}>
                    <div className="h-8 bg-muted animate-pulse rounded" />
                  </TableCell>
                </TableRow>
              ))
            ) : filteredOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Заказы не найдены
                </TableCell>
              </TableRow>
            ) : (
              filteredOrders.map((order) => {
                const isExpanded = expandedOrders.has(order.id);
                return (
                  <React.Fragment key={order.id}>
                    <TableRow className="cursor-pointer hover:bg-muted/50">
                      <TableCell onClick={() => toggleExpanded(order.id)}>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{order.orderNumber}</TableCell>
                      <TableCell>{getCustomerDisplay(order)}</TableCell>
                      <TableCell>
                        <Badge className={cn("border", STATUS_COLORS[order.status])}>
                          {STATUS_LABELS[order.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>{DELIVERY_TYPE_LABELS[order.deliveryType]}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatRub(order.totalAmount)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(order.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {order.status === "paid" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateOrderStatus(order.id, "processing")}
                              disabled={updatingStatus === order.id}
                            >
                              В комплектацию
                            </Button>
                          )}
                          {order.status === "processing" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateOrderStatus(order.id, "shipped")}
                              disabled={updatingStatus === order.id}
                            >
                              Отправить
                            </Button>
                          )}
                          {order.status === "shipped" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateOrderStatus(order.id, "delivered")}
                              disabled={updatingStatus === order.id}
                            >
                              Доставлен
                            </Button>
                          )}
                          {(order.status === "pending" || order.status === "paid") && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => updateOrderStatus(order.id, "cancelled")}
                              disabled={updatingStatus === order.id}
                            >
                              Отменить
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={8} className="bg-muted/20">
                          <div className="py-4 px-6">
                            <h4 className="font-semibold mb-3">Состав заказа:</h4>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Товар</TableHead>
                                  <TableHead>SKU</TableHead>
                                  <TableHead>Вариант</TableHead>
                                  <TableHead className="text-right">Цена</TableHead>
                                  <TableHead className="text-right">Кол-во</TableHead>
                                  <TableHead className="text-right">Сумма</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {order.items.map((item) => (
                                  <TableRow key={item.id}>
                                    <TableCell>{item.product.name}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                      {item.product.sku || "—"}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                      {item.variant?.option.value || "—"}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {formatRub(item.price)}
                                    </TableCell>
                                    <TableCell className="text-right">{item.quantity}</TableCell>
                                    <TableCell className="text-right font-medium">
                                      {formatRub(item.total)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
