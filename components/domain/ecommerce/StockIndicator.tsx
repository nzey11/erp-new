"use client";

import { Tag } from "antd";

interface StockIndicatorProps {
  quantity: number;
  unitShortName: string;
}

export function StockIndicator({ quantity, unitShortName }: StockIndicatorProps) {
  if (quantity <= 0) {
    return (
      <Tag color="red">
        Нет в наличии
      </Tag>
    );
  }

  if (quantity <= 10) {
    return (
      <Tag color="orange">
        Мало на складе ({quantity} {unitShortName})
      </Tag>
    );
  }

  return (
    <Tag color="green">
      В наличии ({quantity} {unitShortName})
    </Tag>
  );
}
