"use client";

import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tag } from "antd";
import { formatRub } from "@/lib/shared/utils";

export type ProductCardData = {
  id: string;
  name: string;
  slug: string | null;
  imageUrl: string | null;
  price: number;
  discountedPrice: number | null;
  discount: { name: string; type: string; value: number } | null;
  rating: number;
  reviewCount: number;
  unit: { shortName: string };
};

interface ProductCardProps {
  product: ProductCardData;
}

export function ProductCard({ product }: ProductCardProps) {
  return (
    <Link href={`/store/catalog/${product.slug || product.id}`}>
      <Card className="group overflow-hidden hover:shadow-lg transition-shadow cursor-pointer h-full flex flex-col">
        <div className="relative aspect-square bg-muted">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              Нет фото
            </div>
          )}
          {product.discount && (
            <Tag color="red" className="absolute top-2 right-2">
              {product.discount.type === "percentage"
                ? `-${product.discount.value}%`
                : `-${formatRub(product.discount.value)}`}
            </Tag>
          )}
        </div>
        <div className="p-4 flex flex-col flex-1">
          <h3 className="font-medium text-sm mb-2 line-clamp-2 group-hover:text-primary transition-colors">
            {product.name}
          </h3>
          {product.reviewCount > 0 && (
            <div className="flex items-center gap-1 mb-2">
              <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
              <span className="text-xs font-medium">{product.rating}</span>
              <span className="text-xs text-muted-foreground">
                ({product.reviewCount})
              </span>
            </div>
          )}
          <div className="mt-auto">
            {product.discountedPrice ? (
              <div>
                <div className="text-xs text-muted-foreground line-through">
                  {formatRub(product.price)}
                </div>
                <div className="text-lg font-bold text-primary">
                  {formatRub(product.discountedPrice)}
                </div>
              </div>
            ) : (
              <div className="text-lg font-bold">
                {formatRub(product.price)}
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-0.5">
              за {product.unit.shortName}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
