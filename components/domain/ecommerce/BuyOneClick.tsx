"use client";

import { useState } from "react";
import { Zap } from "lucide-react";
import { Modal, Input, Typography, Button } from "antd";
import { toast } from "sonner";
import { formatRub } from "@/lib/shared/utils";

interface BuyOneClickProps {
  productId: string;
  variantId: string | null;
  quantity: number;
  price: number;
  productName: string;
}

export function BuyOneClick({
  productId,
  variantId,
  quantity,
  price,
  productName,
}: BuyOneClickProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Укажите имя");
      return;
    }
    if (!phone.trim() || phone.trim().length < 6) {
      toast.error("Укажите телефон");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/ecommerce/orders/quick-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          variantId: variantId || null,
          quantity,
          customerName: name.trim(),
          customerPhone: phone.trim(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setOrderNumber(data.orderNumber);
      } else {
        const err = await res.json();
        toast.error(err.error || "Не удалось оформить заказ");
      }
    } catch {
      toast.error("Не удалось оформить заказ");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setOrderNumber(null);
    setName("");
    setPhone("");
  };

  return (
    <>
      <Button
        variant="outlined"
        size="large"
        className="flex-1"
        onClick={() => setOpen(true)}
        icon={<Zap className="h-4 w-4" />}
      >
        Купить в 1 клик
      </Button>

      <Modal
        open={open}
        onCancel={handleClose}
        footer={
          orderNumber ? (
            <Button type="primary" onClick={handleClose} className="w-full">
              Закрыть
            </Button>
          ) : (
            <>
              <Button variant="outlined" onClick={handleClose}>
                Отмена
              </Button>
              <Button type="primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Оформление..." : "Оформить"}
              </Button>
            </>
          )
        }
        title={orderNumber ? "Заказ оформлен!" : "Быстрый заказ"}
      >
        {orderNumber ? (
          <div className="py-6 text-center space-y-3">
            <div className="text-4xl mb-4">&#10003;</div>
            <p className="text-lg font-semibold">
              Заказ #{orderNumber}
            </p>
            <p className="text-muted-foreground text-sm">
              Мы свяжемся с вами для подтверждения заказа
            </p>
          </div>
        ) : (
          <>
              <div className="space-y-4 py-4">
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="font-medium text-sm line-clamp-2">{productName}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {quantity} шт. &middot; {formatRub(price * quantity)}
                  </p>
                </div>

                <div className="grid gap-2">
                  <Typography.Text strong>Ваше имя *</Typography.Text>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Иван Иванов"
                  />
                </div>
                <div className="grid gap-2">
                  <Typography.Text strong>Телефон *</Typography.Text>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+7 (900) 123-45-67"
                    type="tel"
                  />
                </div>
              </div>
              </>
            )}
          </Modal>
    </>
  );
}
