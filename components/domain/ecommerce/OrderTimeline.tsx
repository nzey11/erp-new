"use client";

import { cn } from "@/lib/shared/utils";
import { formatDate } from "@/lib/shared/utils";
import { Check, Clock, CreditCard, Package, Truck, MapPin, XCircle } from "lucide-react";

const steps = [
  { status: "pending", label: "Создан", icon: Clock },
  { status: "paid", label: "Оплачен", icon: CreditCard },
  { status: "processing", label: "Комплектуется", icon: Package },
  { status: "shipped", label: "Отправлен", icon: Truck },
  { status: "delivered", label: "Доставлен", icon: MapPin },
];

interface OrderTimelineProps {
  status: string;
  createdAt: string;
  paidAt?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
}

export function OrderTimeline({
  status,
  createdAt,
  paidAt,
  shippedAt,
  deliveredAt,
}: OrderTimelineProps) {
  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-3 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
          <XCircle className="h-4 w-4 text-red-600" />
        </div>
        <div>
          <p className="text-sm font-medium text-red-600">Заказ отменён</p>
          <p className="text-xs text-muted-foreground">{formatDate(createdAt)}</p>
        </div>
      </div>
    );
  }

  const statusIndex = steps.findIndex((s) => s.status === status);
  const currentStep = Math.max(0, statusIndex);

  const dateMap: Record<string, string | null | undefined> = {
    pending: createdAt,
    paid: paidAt,
    shipped: shippedAt,
    delivered: deliveredAt,
  };

  return (
    <div className="flex items-center gap-0 overflow-x-auto py-2">
      {steps.map((step, idx) => {
        const isCompleted = idx <= currentStep;
        const isCurrent = idx === currentStep;
        const Icon = step.icon;
        const date = dateMap[step.status];

        return (
          <div key={step.status} className="flex items-center">
            <div className="flex flex-col items-center min-w-[80px]">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                  isCompleted
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted && !isCurrent ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <span
                className={cn(
                  "text-xs mt-1.5 text-center",
                  isCurrent ? "font-semibold text-primary" : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
              {date && isCompleted && (
                <span className="text-[10px] text-muted-foreground mt-0.5">
                  {formatDate(date)}
                </span>
              )}
            </div>
            {idx < steps.length - 1 && (
              <div
                className={cn(
                  "h-0.5 w-8 mx-1",
                  idx < currentStep ? "bg-primary" : "bg-muted"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
