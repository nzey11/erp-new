"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, Package, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "antd";
import { Tag } from "antd";
import { formatRub, formatDate } from "@/lib/shared/utils";
import { toast } from "sonner";
import { OrderTimeline } from "@/components/domain/ecommerce/OrderTimeline";
import { ReviewForm } from "@/components/domain/ecommerce/ReviewForm";

type OrderItem = {
  id: string;
  productId: string;
  productName: string;
  productImageUrl: string | null;
  productSlug: string | null;
  variantOption: string | null;
  quantity: number;
  price: number;
  total: number;
};

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  deliveryType: string;
  totalAmount: number;
  deliveryCost: number;
  createdAt: string;
  paidAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  items: OrderItem[];
  deliveryAddress: {
    recipientName: string;
    phone: string;
    city: string;
    street: string;
    building: string;
    apartment: string | null;
  } | null;
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

const deliveryTypeLabels: Record<string, string> = {
  pickup: "Самовывоз",
  courier: "Курьерская доставка",
};

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [reviewTarget, setReviewTarget] = useState<{
    productId: string;
    productName: string;
    orderId: string;
  } | null>(null);

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/ecommerce/orders?limit=50");
        if (res.ok) {
          const data = await res.json();
          setOrders(data.orders || []);
        } else if (res.status === 401) {
          router.push("/store/register");
        } else {
          toast.error("Не удалось загрузить заказы");
        }
      } catch (error) {
        console.error("Failed to fetch orders:", error);
        toast.error("Не удалось загрузить заказы");
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [router]);

  const toggleOrder = (orderId: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/4" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-6">
              <div className="h-24 bg-muted rounded" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/store/account" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ChevronLeft className="h-4 w-4" />
          Назад в кабинет
        </Link>
        <h1 className="text-3xl font-bold mb-2">Мои заказы</h1>
        <p className="text-muted-foreground">
          {orders.length === 0 ? "У вас пока нет заказов" : `Всего заказов: ${orders.length}`}
        </p>
      </div>

      {/* Orders List */}
      {orders.length === 0 ? (
        <div className="text-center py-12">
          <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-2xl font-semibold mb-2">У вас пока нет заказов</h2>
          <p className="text-muted-foreground mb-6">
            Перейдите в каталог, чтобы сделать первый заказ
          </p>
          <Button onClick={() => router.push("/store/catalog")}>
            Перейти в каталог
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const isExpanded = expandedOrders.has(order.id);
            return (
              <Card key={order.id} className="overflow-hidden">
                {/* Order Header */}
                <div
                  className="p-6 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => toggleOrder(order.id)}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-lg">Заказ #{order.orderNumber}</h3>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(order.createdAt)}
                      </p>
                    </div>
                    <Tag color={statusColors[order.status] ?? ""}>
                      {statusLabels[order.status] || order.status}
                    </Tag>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <span className="text-muted-foreground">
                        {deliveryTypeLabels[order.deliveryType] || order.deliveryType}
                      </span>
                      {" • "}
                      <span className="text-muted-foreground">
                        {order.items.length} {order.items.length === 1 ? "товар" : "товаров"}
                      </span>
                    </div>
                    <div className="text-xl font-bold">
                      {formatRub(order.totalAmount)}
                    </div>
                  </div>
                </div>

                {/* Order Details (Expanded) */}
                {isExpanded && (
                  <div className="border-t bg-muted/10 p-6 space-y-6">
                    {/* Order Timeline */}
                    <OrderTimeline
                      status={order.status}
                      createdAt={order.createdAt}
                      paidAt={order.paidAt}
                      shippedAt={order.shippedAt}
                      deliveredAt={order.deliveredAt}
                    />

                    {/* Items */}
                    <div>
                      <h4 className="font-semibold mb-3">Товары:</h4>
                      <div className="space-y-3">
                        {order.items.map((item) => (
                          <div key={item.id} className="flex gap-4">
                            <Link
                              href={`/store/catalog/${item.productSlug || item.productId}`}
                              className="relative w-16 h-16 bg-muted rounded-lg overflow-hidden shrink-0"
                            >
                              {item.productImageUrl ? (
                                <Image
                                  src={item.productImageUrl}
                                  alt={item.productName}
                                  fill
                                  className="object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                                  Нет фото
                                </div>
                              )}
                            </Link>
                            <div className="flex-1 min-w-0">
                              <Link href={`/store/catalog/${item.productSlug || item.productId}`}>
                                <h5 className="font-medium hover:text-primary transition-colors line-clamp-1">
                                  {item.productName}
                                </h5>
                              </Link>
                              {item.variantOption && (
                                <p className="text-sm text-muted-foreground">
                                  {item.variantOption}
                                </p>
                              )}
                              <p className="text-sm text-muted-foreground mt-1">
                                {item.quantity} × {formatRub(item.price)}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <div className="font-semibold shrink-0">
                                {formatRub(item.total)}
                              </div>
                              {(order.status === "delivered" || order.status === "paid" || order.status === "shipped") && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs h-7"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setReviewTarget({
                                      productId: item.productId,
                                      productName: item.productName,
                                      orderId: order.id,
                                    });
                                  }}
                                >
                                  <Star className="h-3 w-3 mr-1" />
                                  Отзыв
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Delivery Address */}
                    {order.deliveryAddress && (
                      <div>
                        <h4 className="font-semibold mb-2">Адрес доставки:</h4>
                        <p className="text-sm text-muted-foreground">
                          {order.deliveryAddress.recipientName}, {order.deliveryAddress.phone}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          г. {order.deliveryAddress.city}, ул. {order.deliveryAddress.street},
                          д. {order.deliveryAddress.building}
                          {order.deliveryAddress.apartment && `, кв. ${order.deliveryAddress.apartment}`}
                        </p>
                      </div>
                    )}

                    {/* Total */}
                    <div className="border-t pt-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Товары:</span>
                        <span>{formatRub(order.totalAmount - order.deliveryCost)}</span>
                      </div>
                      {order.deliveryCost > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Доставка:</span>
                          <span>{formatRub(order.deliveryCost)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold text-lg">
                        <span>Итого:</span>
                        <span>{formatRub(order.totalAmount)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Review Dialog */}
      {reviewTarget && (
        <ReviewForm
          productId={reviewTarget.productId}
          productName={reviewTarget.productName}
          orderId={reviewTarget.orderId}
          open={!!reviewTarget}
          onOpenChange={(open) => { if (!open) setReviewTarget(null); }}
        />
      )}
    </div>
  );
}
