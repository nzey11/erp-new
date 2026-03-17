"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { ProductFormContent } from "@/components/domain/accounting/catalog/ProductFormContent";
// Local Product type for page (matches API response)
interface Product {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  unitId: string;
  categoryId: string | null;
  purchasePrice: number | null;
  salePrice: number | null;
  imageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  slug: string | null;
  publishedToStore: boolean;
}

interface Unit { id: string; name: string; shortName: string; }
interface Category { id: string; name: string; parentId: string | null; }

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const isNew = params.id === "new";

  const [product, setProduct] = useState<Product | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    Promise.all([
      isNew
        ? Promise.resolve(null)
        : fetch(`/api/accounting/products/${params.id}`).then((r) => {
            if (r.status === 404) { setNotFound(true); return null; }
            return r.ok ? r.json() : null;
          }),
      fetch("/api/accounting/units").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/accounting/categories").then((r) => (r.ok ? r.json() : [])),
    ]).then(([p, u, c]) => {
      if (!isNew) setProduct(p);
      setUnits(Array.isArray(u) ? u : []);
      setCategories(Array.isArray(c) ? c : []);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded bg-muted animate-pulse" />
          <div className="h-8 w-48 rounded bg-muted animate-pulse" />
        </div>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 rounded bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/products")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <PageHeader title="Товар не найден" />
        </div>
        <p className="text-muted-foreground">Товар с ID «{params.id}» не существует или был удалён.</p>
        <Button variant="outline" onClick={() => router.push("/products")}>
          Вернуться к списку
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/products")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader title={product?.name ?? "Новый товар"} />
      </div>

      <ProductFormContent
        editingProduct={product}
        units={units}
        categories={categories}
        onSaved={(saved) => {
          if (isNew && saved) {
            // After creating, redirect to the newly created product's page
            router.replace(`/products/${saved.id}`);
          } else if (saved) {
            // Refresh product name in header
            setProduct(saved);
          }
        }}
        onCancel={() => router.push("/products")}
      />
    </div>
  );
}
