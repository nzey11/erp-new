"use client";

import { Tabs } from "antd";
import { Card } from "@/components/ui/card";
import { Star } from "lucide-react";
import { cn, formatDate } from "@/lib/shared/utils";
import { Tag } from "antd";
import type { TabsProps } from "antd";

type Characteristic = { name: string; value: string };
type Review = {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  isVerifiedPurchase: boolean;
  customerName: string;
  createdAt: string;
};

interface ProductTabsProps {
  description: string | null;
  characteristics: Characteristic[];
  reviews: Review[];
  reviewCount: number;
}

export function ProductTabs({
  description,
  characteristics,
  reviews,
  reviewCount,
}: ProductTabsProps) {
  const items: TabsProps["items"] = [
    {
      key: "description",
      label: "Описание",
      children: description ? (
        <div className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
          {description}
        </div>
      ) : (
        <p className="text-muted-foreground">Описание отсутствует</p>
      ),
    },
  ];

  if (characteristics.length > 0) {
    items.push({
      key: "characteristics",
      label: "Характеристики",
      children: (
        <div className="space-y-0">
          {characteristics.map((char, idx) => (
            <div
              key={idx}
              className={cn(
                "flex justify-between py-3 px-2",
                idx % 2 === 0 ? "bg-muted/30" : ""
              )}
            >
              <span className="text-muted-foreground">{char.name}</span>
              <span className="font-medium text-right">{char.value}</span>
            </div>
          ))}
        </div>
      ),
    });
  }

  items.push({
    key: "reviews",
    label: `Отзывы${reviewCount > 0 ? ` (${reviewCount})` : ""}`,
    children:
      reviews.length > 0 ? (
        <div className="space-y-4">
          {reviews.map((review) => (
            <Card key={review.id} className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{review.customerName}</span>
                    {review.isVerifiedPurchase && (
                      <Tag color="default" className="text-xs">
                        Проверенная покупка
                      </Tag>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={cn(
                          "h-3.5 w-3.5",
                          i < review.rating
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-muted-foreground/30"
                        )}
                      />
                    ))}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDate(review.createdAt)}
                </span>
              </div>
              {review.title && (
                <h4 className="font-semibold text-sm mb-1">{review.title}</h4>
              )}
              {review.comment && (
                <p className="text-sm text-muted-foreground">{review.comment}</p>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-center py-8">
          Пока нет отзывов. Будьте первым!
        </p>
      ),
  });

  return (
    <Tabs
      defaultActiveKey="description"
      className="w-full"
      items={items}
    />
  );
}
