"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, Heart, X, Star } from "lucide-react";
import { Card, Tag, Button } from "antd";
import { formatRub } from "@/lib/shared/utils";
import { toast } from "sonner";

type FavoriteItem = {
  id: string;
  productId: string;
  productName: string;
  productSlug: string | null;
  productImageUrl: string | null;
  price: number;
  discountedPrice: number | null;
  discount: { name: string; type: string; value: number } | null;
  rating: number;
  reviewCount: number;
  unitShortName: string;
};

export default function FavoritesPage() {
  const router = useRouter();
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFavorites = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/ecommerce/favorites");
        if (res.ok) {
          const data = await res.json();
          setItems(data.items || []);
        } else if (res.status === 401) {
          router.push("/store/register");
        } else {
          toast.error("Не удалось загрузить избранное");
        }
      } catch (error) {
        console.error("Failed to fetch favorites:", error);
        toast.error("Не удалось загрузить избранное");
      } finally {
        setLoading(false);
      }
    };

    fetchFavorites();
  }, [router]);

  const handleRemove = async (productId: string) => {
    // Optimistic update
    setItems((prev) => prev.filter((item) => item.productId !== productId));

    try {
      const res = await fetch(`/api/ecommerce/favorites?productId=${productId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast.success("Удалено из избранного");
      } else {
        // Revert on error - refetch
        const refetchRes = await fetch("/api/ecommerce/favorites");
        if (refetchRes.ok) {
          const data = await refetchRes.json();
          setItems(data.items || []);
        }
        toast.error("Не удалось удалить из избранного");
      }
    } catch (error) {
      console.error("Failed to remove favorite:", error);
      toast.error("Не удалось удалить из избранного");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="p-4">
              <div className="aspect-square bg-muted rounded-lg mb-4" />
              <div className="h-4 bg-muted rounded mb-2" />
              <div className="h-4 bg-muted rounded w-2/3" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/store/account" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ChevronLeft className="h-4 w-4" />
          Назад в кабинет
        </Link>
        <h1 className="text-3xl font-bold mb-2">Избранное</h1>
        <p className="text-muted-foreground">
          {items.length === 0 ? "У вас пока нет избранных товаров" : `Сохранено товаров: ${items.length}`}
        </p>
      </div>

      {/* Favorites Grid */}
      {items.length === 0 ? (
        <div className="text-center py-12">
          <Heart className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-2xl font-semibold mb-2">Избранное пусто</h2>
          <p className="text-muted-foreground mb-6">
            Добавляйте товары в избранное, чтобы не потерять их
          </p>
          <Button type="primary" onClick={() => router.push("/store/catalog")}>
            Перейти в каталог
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {items.map((item) => (
            <Card key={item.id} className="group overflow-hidden relative">
              <Link href={`/store/catalog/${item.productSlug || item.productId}`}>
                <div className="relative aspect-square bg-muted">
                  {item.productImageUrl ? (
                    <Image
                      src={item.productImageUrl}
                      alt={item.productName}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      Нет фото
                    </div>
                  )}
                  {item.discount && (
                    <Tag color="red" className="absolute top-2 right-2">
                      {item.discount.type === "percentage"
                        ? `-${item.discount.value}%`
                        : `-${formatRub(item.discount.value)}`}
                    </Tag>
                  )}
                </div>
              </Link>

              {/* Remove Button */}
              <Button
                type="text"
                className="absolute top-2 left-2 bg-background/80 hover:bg-background z-10"
                icon={<X className="h-4 w-4 text-destructive" />}
                onClick={() => handleRemove(item.productId)}
              />

              <div className="p-4">
                <Link href={`/store/catalog/${item.productSlug || item.productId}`}>
                  <h3 className="font-semibold mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                    {item.productName}
                  </h3>
                </Link>

                {item.reviewCount > 0 && (
                  <div className="flex items-center gap-1 mb-2">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    <span className="text-sm font-medium">{item.rating}</span>
                    <span className="text-sm text-muted-foreground">
                      ({item.reviewCount})
                    </span>
                  </div>
                )}

                <div>
                  {item.discountedPrice ? (
                    <div>
                      <div className="text-sm text-muted-foreground line-through">
                        {formatRub(item.price)}
                      </div>
                      <div className="text-xl font-bold text-primary">
                        {formatRub(item.discountedPrice)}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xl font-bold">
                      {formatRub(item.price)}
                    </div>
                  )}
                  <div className="text-sm text-muted-foreground mt-1">
                    за {item.unitShortName}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
