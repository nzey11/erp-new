"use client";

import { useRouter } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { Card, Button } from "antd";
import { formatRub } from "@/lib/shared/utils";
import { useCart } from "@/components/domain/ecommerce/CartContext";
import { CartItemCard } from "@/components/domain/ecommerce/CartItemCard";

export default function CartPage() {
  const router = useRouter();
  const { items, count, totalAmount, loading, updateQuantity, removeFromCart } = useCart();

  if (loading && count === 0) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/4" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-4">
              <div className="h-24 bg-muted rounded" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Корзина пуста</h2>
        <p className="text-muted-foreground mb-6">
          Добавьте товары из каталога, чтобы оформить заказ
        </p>
        <Button type="primary" onClick={() => router.push("/store/catalog")}>
          Перейти в каталог
        </Button>
      </div>
    );
  }

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Корзина</h1>
        <p className="text-muted-foreground">
          {count} {count === 1 ? "товар" : "товаров"}
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Cart Items */}
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => (
            <CartItemCard
              key={item.id}
              id={item.id}
              productId={item.productId}
              productName={item.productName}
              productImageUrl={item.productImageUrl}
              slug={item.slug}
              variantOption={item.variantOption}
              quantity={item.quantity}
              priceSnapshot={item.priceSnapshot}
              unitShortName={item.unitShortName}
              onUpdateQuantity={updateQuantity}
              onRemove={removeFromCart}
            />
          ))}
        </div>

        {/* Summary */}
        <div className="lg:col-span-1">
          <Card className="p-6 sticky top-20">
            <h2 className="text-xl font-semibold mb-4">Итого</h2>
            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Товаров:</span>
                <span>{count}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Количество:</span>
                <span>{totalQuantity}</span>
              </div>
              <div className="border-t pt-3 flex justify-between">
                <span className="font-semibold">Сумма:</span>
                <span className="text-2xl font-bold">{formatRub(totalAmount)}</span>
              </div>
            </div>
            <Button
              size="large"
              type="primary"
              className="w-full"
              onClick={() => router.push("/store/checkout")}
            >
              Оформить заказ
            </Button>
            <Button
              variant="outlined"
              className="w-full mt-3"
              onClick={() => router.push("/store/catalog")}
            >
              Продолжить покупки
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
