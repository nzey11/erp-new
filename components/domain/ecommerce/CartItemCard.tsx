"use client";

import Image from "next/image";
import Link from "next/link";
import { Trash2, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "antd";
import { formatRub } from "@/lib/shared/utils";

interface CartItemCardProps {
  id: string;
  productId: string;
  productName: string;
  productImageUrl: string | null;
  slug: string | null;
  variantOption: string | null;
  quantity: number;
  priceSnapshot: number;
  unitShortName: string;
  onUpdateQuantity: (itemId: string, delta: number) => void;
  onRemove: (itemId: string) => void;
}

export function CartItemCard({
  id,
  productId,
  productName,
  productImageUrl,
  slug,
  variantOption,
  quantity,
  priceSnapshot,
  unitShortName,
  onUpdateQuantity,
  onRemove,
}: CartItemCardProps) {
  const productHref = `/store/catalog/${slug || productId}`;

  return (
    <Card className="p-4">
      <div className="flex gap-4">
        {/* Image */}
        <Link
          href={productHref}
          className="relative w-24 h-24 bg-muted rounded-lg overflow-hidden shrink-0"
        >
          {productImageUrl ? (
            <Image
              src={productImageUrl}
              alt={productName}
              fill
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
              Нет фото
            </div>
          )}
        </Link>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <Link href={productHref}>
            <h3 className="font-semibold hover:text-primary transition-colors line-clamp-2">
              {productName}
            </h3>
          </Link>
          {variantOption && (
            <p className="text-sm text-muted-foreground mt-1">{variantOption}</p>
          )}
          <div className="flex items-center gap-4 mt-3">
            {/* Quantity */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => onUpdateQuantity(id, -1)}
                disabled={quantity <= 1}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <span className="w-8 text-center text-sm font-medium">{quantity}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => onUpdateQuantity(id, 1)}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>

            {/* Unit price */}
            <div className="text-sm">
              <span className="font-semibold">{formatRub(priceSnapshot)}</span>
              <span className="text-muted-foreground"> / {unitShortName}</span>
            </div>
          </div>
        </div>

        {/* Actions & subtotal */}
        <div className="flex flex-col items-end justify-between">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onRemove(id)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
          <div className="text-lg font-bold">
            {formatRub(priceSnapshot * quantity)}
          </div>
        </div>
      </div>
    </Card>
  );
}
