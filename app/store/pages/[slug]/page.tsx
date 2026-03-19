"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "antd";
import { RichTextRenderer } from "@/components/domain/ecommerce/RichTextRenderer";

type PageData = {
  id: string;
  title: string;
  slug: string;
  content: string;
  seoTitle: string | null;
  seoDescription: string | null;
};

export default function StorePageView() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;

  const [page, setPage] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPage = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/ecommerce/cms-pages/${slug}`);
        if (res.ok) {
          const data = await res.json();
          setPage(data);
        } else {
          setPage(null);
        }
      } catch {
        setPage(null);
      } finally {
        setLoading(false);
      }
    };

    if (slug) {
      fetchPage();
    }
  }, [slug]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/4" />
        <div className="h-10 bg-muted rounded w-3/4" />
        <div className="space-y-3">
          <div className="h-4 bg-muted rounded" />
          <div className="h-4 bg-muted rounded w-5/6" />
          <div className="h-4 bg-muted rounded w-4/6" />
        </div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="text-center py-16">
        <h2 className="text-2xl font-semibold mb-2">Страница не найдена</h2>
        <p className="text-muted-foreground mb-6">
          Запрашиваемая страница не существует или была удалена
        </p>
        <Button variant="outlined" onClick={() => router.push("/store")}>
          На главную
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/store" className="hover:text-foreground">
          Главная
        </Link>
        <ChevronLeft className="h-4 w-4 rotate-180" />
        <span className="text-foreground">{page.title}</span>
      </div>

      {/* Title */}
      <h1 className="text-3xl font-bold mb-8">{page.title}</h1>

      {/* Content */}
      <RichTextRenderer content={page.content} />
    </div>
  );
}
