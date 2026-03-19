"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Button, Tag, Card, Select, Table } from "antd";
import type { TableColumnsType } from "antd";
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

  const columns: TableColumnsType<Review> = [
    {
      key: "product",
      title: "Товар",
      render: (_, review) => (
        <div>
          <p className="font-medium">{review.product.name}</p>
          {review.product.sku && (
            <p className="text-xs text-muted-foreground">{review.product.sku}</p>
          )}
        </div>
      ),
    },
    {
      key: "customer",
      title: "Покупатель",
      render: (_, review) => (
        <div>
          <p>{getCustomerDisplay(review)}</p>
          {review.isVerifiedPurchase && (
            <Tag color="default" className="mt-1 text-xs">
              Подтверждённая покупка
            </Tag>
          )}
        </div>
      ),
    },
    {
      key: "rating",
      dataIndex: "rating",
      title: "Оценка",
      render: (rating: number) => renderStars(rating),
    },
    {
      key: "review",
      title: "Отзыв",
      render: (_, review) => (
        <div className="max-w-xs">
          {review.title && <p className="font-medium text-sm mb-1">{review.title}</p>}
          {review.comment && (
            <p className="text-sm text-muted-foreground line-clamp-2">{review.comment}</p>
          )}
          {!review.title && !review.comment && (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </div>
      ),
    },
    {
      key: "status",
      dataIndex: "isPublished",
      title: "Статус",
      render: (isPublished: boolean) => (
        <Tag color={isPublished ? "blue" : "default"}>
          {isPublished ? "Опубликован" : "Не опубликован"}
        </Tag>
      ),
    },
    {
      key: "createdAt",
      dataIndex: "createdAt",
      title: "Дата",
      render: (createdAt: string) => (
        <span className="text-sm text-muted-foreground">{formatDateTime(createdAt)}</span>
      ),
    },
    {
      key: "actions",
      title: "Действия",
      render: (_, review) => (
        <div className="flex items-center gap-2">
          <Button
            size="small"
            variant="outlined"
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
            size="small"
            danger
            onClick={() => handleDelete(review.id)}
            disabled={deleting === review.id}
            icon={<Trash2 className="h-3 w-3" />}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Отзывы"
        description="Модерация отзывов покупателей"
      />

      {/* Filter */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium">Показать:</label>
        <Select
          value={filter}
          onChange={setFilter}
          style={{ width: 200 }}
          options={[
            { value: "all", label: "Все отзывы" },
            { value: "published", label: "Опубликованные" },
            { value: "unpublished", label: "Неопубликованные" },
          ]}
        />
      </div>

      {/* Reviews table */}
      <Card>
        <Table
          columns={columns}
          dataSource={filteredReviews}
          rowKey="id"
          pagination={false}
          loading={loading}
          locale={{ emptyText: "Отзывы не найдены" }}
        />
      </Card>
    </div>
  );
}
