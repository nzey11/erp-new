"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Star, Trash2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { csrfFetch } from "@/lib/client/csrf";
import { cn, formatDateTime } from "@/lib/shared/utils";

interface Review {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  isPublished: boolean;
  isVerifiedPurchase: boolean;
  createdAt: string;
  product: {
    name: string;
    sku: string | null;
  };
  customer: {
    name: string | null;
    phone: string | null;
    telegramUsername: string | null;
  };
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [updating, setUpdating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadReviews();
  }, []);

  const loadReviews = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/accounting/ecommerce/reviews");
      if (!res.ok) throw new Error("Ошибка загрузки отзывов");
      const data = await res.json();
      setReviews(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  const togglePublished = async (review: Review) => {
    setUpdating(review.id);
    try {
      const res = await csrfFetch(`/api/accounting/ecommerce/reviews?id=${review.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished: !review.isPublished }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка обновления");
      }

      toast.success(review.isPublished ? "Отзыв скрыт" : "Отзыв опубликован");
      await loadReviews();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка");
    } finally {
      setUpdating(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить отзыв? Это действие нельзя отменить.")) return;

    setDeleting(id);
    try {
      const res = await csrfFetch(`/api/accounting/ecommerce/reviews?id=${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка удаления");
      }

      toast.success("Отзыв удалён");
      await loadReviews();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка");
    } finally {
      setDeleting(null);
    }
  };

  const getCustomerDisplay = (review: Review) => {
    if (review.customer.name) return review.customer.name;
    if (review.customer.phone) return review.customer.phone;
    if (review.customer.telegramUsername) return `@${review.customer.telegramUsername}`;
    return "Не указано";
  };

  const filteredReviews = (() => {
    switch (filter) {
      case "published":
        return reviews.filter((r) => r.isPublished);
      case "unpublished":
        return reviews.filter((r) => !r.isPublished);
      default:
        return reviews;
    }
  })();

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={cn(
              "h-4 w-4",
              star <= rating
                ? "fill-yellow-400 text-yellow-400"
                : "text-gray-300"
            )}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Отзывы"
        description="Модерация отзывов покупателей"
      />

      {/* Filter */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium">Показать:</label>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все отзывы</SelectItem>
            <SelectItem value="published">Опубликованные</SelectItem>
            <SelectItem value="unpublished">Неопубликованные</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Reviews table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Товар</TableHead>
              <TableHead>Покупатель</TableHead>
              <TableHead>Оценка</TableHead>
              <TableHead>Отзыв</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead>Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <div className="h-8 bg-muted animate-pulse rounded" />
                  </TableCell>
                </TableRow>
              ))
            ) : filteredReviews.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Отзывы не найдены
                </TableCell>
              </TableRow>
            ) : (
              filteredReviews.map((review) => (
                <TableRow key={review.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{review.product.name}</p>
                      {review.product.sku && (
                        <p className="text-xs text-muted-foreground">{review.product.sku}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p>{getCustomerDisplay(review)}</p>
                      {review.isVerifiedPurchase && (
                        <Badge variant="secondary" className="mt-1 text-xs">
                          Подтверждённая покупка
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{renderStars(review.rating)}</TableCell>
                  <TableCell className="max-w-xs">
                    {review.title && (
                      <p className="font-medium text-sm mb-1">{review.title}</p>
                    )}
                    {review.comment && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {review.comment}
                      </p>
                    )}
                    {!review.title && !review.comment && (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={review.isPublished ? "default" : "secondary"}
                    >
                      {review.isPublished ? "Опубликован" : "Не опубликован"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTime(review.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => togglePublished(review)}
                        disabled={updating === review.id}
                      >
                        {review.isPublished ? (
                          <>
                            <EyeOff className="h-3 w-3 mr-1" />
                            Скрыть
                          </>
                        ) : (
                          <>
                            <Eye className="h-3 w-3 mr-1" />
                            Опубликовать
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(review.id)}
                        disabled={deleting === review.id}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
