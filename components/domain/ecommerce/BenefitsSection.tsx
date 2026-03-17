"use client";

import { Truck, Shield, Clock, Headphones } from "lucide-react";

const benefits = [
  {
    icon: Truck,
    title: "Быстрая доставка",
    description: "Доставка по всей России",
  },
  {
    icon: Shield,
    title: "Гарантия качества",
    description: "Только сертифицированные товары",
  },
  {
    icon: Clock,
    title: "Оперативная обработка",
    description: "Заказы обрабатываются в день оформления",
  },
  {
    icon: Headphones,
    title: "Поддержка 24/7",
    description: "Всегда на связи в Telegram",
  },
];

export function BenefitsSection() {
  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {benefits.map((benefit) => (
        <div
          key={benefit.title}
          className="flex flex-col items-center text-center p-4 rounded-lg border bg-card"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-3">
            <benefit.icon className="h-6 w-6 text-primary" />
          </div>
          <h3 className="font-semibold text-sm mb-1">{benefit.title}</h3>
          <p className="text-xs text-muted-foreground">{benefit.description}</p>
        </div>
      ))}
    </section>
  );
}
