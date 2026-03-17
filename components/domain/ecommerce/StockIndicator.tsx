"use client";

import { Badge } from "@/components/ui/badge";

interface StockIndicatorProps {
  quantity: number;
  unitShortName: string;
}

export function StockIndicator({ quantity, unitShortName }: StockIndicatorProps) {
  if (quantity <= 0) {
    return (
      <Badge variant="secondary" className="text-red-600 bg-red-50">
        Нет в наличии
      </Badge>
    );
  }

  if (quantity <= 10) {
    return (
      <Badge variant="secondary" className="text-amber-600 bg-amber-50">
        Мало на складе ({quantity} {unitShortName})
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="text-green-600 bg-green-50">
      В наличии ({quantity} {unitShortName})
    </Badge>
  );
}
