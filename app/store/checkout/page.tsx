"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, Plus, Check, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatRub } from "@/lib/shared/utils";
import { toast } from "sonner";
import { cn } from "@/lib/shared/utils";
import { useCart } from "@/components/domain/ecommerce/CartContext";

type CartItem = {
  id: string;
  productId: string;
  productName: string;
  productImageUrl: string | null;
  variantOption: string | null;
  quantity: number;
  priceSnapshot: number;
  unitShortName: string;
};

type Address = {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  city: string;
  street: string;
  building: string;
  apartment: string | null;
  isDefault: boolean;
};

export default function CheckoutPage() {
  const router = useRouter();
  const cart = useCart();
  const [items, setItems] = useState<CartItem[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [deliveryType, setDeliveryType] = useState<"pickup" | "courier">("pickup");
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [cartRes, addressesRes] = await Promise.all([
          fetch("/api/ecommerce/cart"),
          fetch("/api/ecommerce/addresses"),
        ]);

        if (!cartRes.ok) {
          router.push("/store/register");
          return;
        }

        const cartData = await cartRes.json();
        setItems(cartData.items || []);

        if (cartData.items.length === 0) {
          toast.error("Корзина пуста");
          router.push("/store/cart");
          return;
        }

        if (addressesRes.ok) {
          const addressesData = await addressesRes.json();
          setAddresses(addressesData.addresses || []);
          
          // Auto-select default address
          const defaultAddr = addressesData.addresses?.find((a: Address) => a.isDefault);
          if (defaultAddr) {
            setSelectedAddressId(defaultAddr.id);
          }
        }
      } catch (error) {
        console.error("Failed to fetch checkout data:", error);
        toast.error("Не удалось загрузить данные");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  const handleSubmit = async () => {
    if (deliveryType === "courier" && !selectedAddressId) {
      toast.error("Выберите адрес доставки");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/ecommerce/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliveryType,
          addressId: deliveryType === "courier" ? selectedAddressId : null,
          notes: notes || null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(`Заказ #${data.orderNumber} успешно оформлен!`);
        await cart.refreshCart();
        router.push("/store/account/orders");
      } else {
        const error = await res.json();
        toast.error(error.error || "Не удалось оформить заказ");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error("Не удалось оформить заказ");
    } finally {
      setSubmitting(false);
    }
  };

  const totalAmount = items.reduce((sum, item) => sum + item.priceSnapshot * item.quantity, 0);
  const deliveryCost = 0; // Add logic if needed
  const finalTotal = totalAmount + deliveryCost;

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/4" />
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-6">
              <div className="h-32 bg-muted rounded" />
            </Card>
          </div>
          <Card className="p-6">
            <div className="h-48 bg-muted rounded" />
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/store/cart" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ChevronLeft className="h-4 w-4" />
          Назад в корзину
        </Link>
        <h1 className="text-3xl font-bold mb-2">Оформление заказа</h1>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Section */}
        <div className="lg:col-span-2 space-y-6">
          {/* Delivery Type */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Способ получения</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div
                className={cn(
                  "border-2 rounded-lg p-4 cursor-pointer transition-all",
                  deliveryType === "pickup"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
                onClick={() => setDeliveryType("pickup")}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">Самовывоз</h3>
                  {deliveryType === "pickup" && (
                    <Check className="h-5 w-5 text-primary" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Бесплатно
                </p>
              </div>

              <div
                className={cn(
                  "border-2 rounded-lg p-4 cursor-pointer transition-all",
                  deliveryType === "courier"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
                onClick={() => setDeliveryType("courier")}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">Курьерская доставка</h3>
                  {deliveryType === "courier" && (
                    <Check className="h-5 w-5 text-primary" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  По согласованию
                </p>
              </div>
            </div>
          </Card>

          {/* Address Selection */}
          {deliveryType === "courier" && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Адрес доставки</h2>
                <Link href="/store/account/addresses">
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Добавить
                  </Button>
                </Link>
              </div>

              {addresses.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">
                    У вас нет сохранённых адресов
                  </p>
                  <Link href="/store/account/addresses">
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Добавить адрес
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {addresses.map((address) => (
                    <div
                      key={address.id}
                      className={cn(
                        "border-2 rounded-lg p-4 cursor-pointer transition-all",
                        selectedAddressId === address.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                      onClick={() => setSelectedAddressId(address.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold">{address.label}</h3>
                            {address.isDefault && (
                              <span className="text-xs text-muted-foreground">(по умолчанию)</span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {address.recipientName}, {address.phone}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            г. {address.city}, ул. {address.street}, д. {address.building}
                            {address.apartment && `, кв. ${address.apartment}`}
                          </p>
                        </div>
                        {selectedAddressId === address.id && (
                          <Check className="h-5 w-5 text-primary shrink-0" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Notes */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Комментарий к заказу</h2>
            <Label htmlFor="notes" className="sr-only">Примечания</Label>
            <Textarea
              id="notes"
              placeholder="Добавьте комментарий к заказу (необязательно)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </Card>
        </div>

        {/* Summary */}
        <div>
          <Card className="p-6 sticky top-20">
            <h2 className="text-xl font-semibold mb-4">Ваш заказ</h2>

            {/* Items */}
            <div className="space-y-3 mb-6 max-h-60 overflow-y-auto">
              {items.map((item) => (
                <div key={item.id} className="flex gap-3">
                  <div className="relative w-12 h-12 bg-muted rounded overflow-hidden shrink-0">
                    {item.productImageUrl ? (
                      <Image
                        src={item.productImageUrl}
                        alt={item.productName}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-2">
                      {item.productName}
                    </p>
                    {item.variantOption && (
                      <p className="text-xs text-muted-foreground">
                        {item.variantOption}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {item.quantity} × {formatRub(item.priceSnapshot)}
                    </p>
                  </div>
                  <div className="text-sm font-semibold shrink-0">
                    {formatRub(item.priceSnapshot * item.quantity)}
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="border-t pt-4 space-y-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Товары:</span>
                <span>{formatRub(totalAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Доставка:</span>
                <span>{deliveryCost === 0 ? "Бесплатно" : formatRub(deliveryCost)}</span>
              </div>
              <div className="flex justify-between font-semibold text-lg">
                <span>Итого:</span>
                <span>{formatRub(finalTotal)}</span>
              </div>
            </div>

            {/* Submit Button */}
            <Button
              size="lg"
              className="w-full"
              onClick={handleSubmit}
              disabled={submitting || (deliveryType === "courier" && !selectedAddressId)}
            >
              {submitting ? "Оформление..." : "Оформить заказ"}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
