"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Modal, Typography } from "antd";
const { TextArea } = Input;
import { toast } from "sonner";
import { cn } from "@/lib/shared/utils";

interface ReviewFormProps {
  productId: string;
  productName: string;
  orderId?: string;      // Legacy - will be removed
  documentId?: string;   // New: link to Document (sales_order)
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ReviewForm({
  productId,
  productName,
  orderId,
  documentId,
  open,
  onOpenChange,
  onSuccess,
}: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error("Поставьте оценку");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/ecommerce/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          rating,
          title: title.trim() || undefined,
          comment: comment.trim() || undefined,
          orderId: orderId || undefined,
          documentId: documentId || undefined,
        }),
      });

      if (res.ok) {
        setSubmitted(true);
        onSuccess?.();
      } else {
        const err = await res.json();
        toast.error(err.error || "Не удалось отправить отзыв");
      }
    } catch {
      toast.error("Не удалось отправить отзыв");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset after close animation
    setTimeout(() => {
      setRating(0);
      setHoveredRating(0);
      setTitle("");
      setComment("");
      setSubmitted(false);
    }, 200);
  };

  const getFooter = () => {
    if (submitted) {
      return (
        <Button onClick={handleClose} className="w-full">
          Закрыть
        </Button>
      );
    }
    return (
      <>
        <Button variant="outline" onClick={handleClose}>
          Отмена
        </Button>
        <Button onClick={handleSubmit} disabled={submitting || rating === 0}>
          {submitting ? "Отправка..." : "Отправить"}
        </Button>
      </>
    );
  };

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={getFooter()}
      title={submitted ? "Спасибо за отзыв!" : "Оставить отзыв"}
    >
      {submitted ? (
        <div className="py-6 text-center space-y-3">
          <div className="flex justify-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={cn(
                  "h-6 w-6",
                  i < rating
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-muted-foreground/30"
                )}
              />
            ))}
          </div>
          <p className="text-muted-foreground text-sm">
            Ваш отзыв будет опубликован после проверки модератором
          </p>
        </div>
      ) : (
        <>
            <div className="space-y-4 py-4">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="font-medium text-sm line-clamp-2">{productName}</p>
              </div>

              {/* Star Rating */}
              <div>
                <Typography.Text strong className="mb-2 block">Оценка *</Typography.Text>
                <div className="flex gap-1">
                  {Array.from({ length: 5 }).map((_, i) => {
                    const starValue = i + 1;
                    return (
                      <button
                        key={i}
                        type="button"
                        onMouseEnter={() => setHoveredRating(starValue)}
                        onMouseLeave={() => setHoveredRating(0)}
                        onClick={() => setRating(starValue)}
                        className="p-0.5"
                      >
                        <Star
                          className={cn(
                            "h-7 w-7 transition-colors",
                            (hoveredRating || rating) >= starValue
                              ? "fill-yellow-400 text-yellow-400"
                              : "text-muted-foreground/30 hover:text-yellow-300"
                          )}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-2">
                <Typography.Text strong>Заголовок</Typography.Text>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Коротко о товаре"
                  maxLength={100}
                />
              </div>

              <div className="grid gap-2">
                <Typography.Text strong>Комментарий</Typography.Text>
                <TextArea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Расскажите подробнее о вашем опыте"
                  rows={4}
                  maxLength={2000}
                />
              </div>
            </div>
            </>
          )}
        </Modal>
      );
}
