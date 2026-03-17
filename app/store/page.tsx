"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { HeroCarousel } from "@/components/domain/ecommerce/HeroCarousel";
import { ProductSection } from "@/components/domain/ecommerce/ProductSection";
import { BenefitsSection } from "@/components/domain/ecommerce/BenefitsSection";

interface PromoBlock {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  linkUrl: string | null;
}

interface Category {
  id: string;
  name: string;
  productCount: number;
  children: { id: string; name: string }[];
}

export default function StorefrontHome() {
  const [promos, setPromos] = useState<PromoBlock[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    fetch("/api/ecommerce/promo-blocks")
      .then((r) => (r.ok ? r.json() : []))
      .then(setPromos)
      .catch(() => {});
    fetch("/api/ecommerce/categories")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((data) => setCategories(data.data || []))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-10">
      {/* Hero Carousel */}
      <HeroCarousel slides={promos} />

      {/* Benefits */}
      <BenefitsSection />

      {/* Categories */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Категории</h2>
          <Link
            href="/store/catalog"
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            Все товары <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        {categories.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {categories.map((cat) => (
              <Link
                key={cat.id}
                href={`/store/catalog?category=${cat.id}`}
                className="flex flex-col items-center justify-center p-4 rounded-lg border bg-card hover:bg-accent hover:border-primary/30 transition-colors text-center"
              >
                <span className="font-medium text-sm">{cat.name}</span>
                {cat.productCount > 0 && (
                  <span className="text-xs text-muted-foreground mt-1">
                    {cat.productCount} товаров
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* New Arrivals */}
      <ProductSection
        title="Новинки"
        href="/store/catalog?sort=newest"
        fetchUrl="/api/ecommerce/products?sort=newest&limit=6"
      />

      {/* Discounted Products - shown as "Акции" (sales) */}
      <ProductSection
        title="Акции и скидки"
        href="/store/catalog"
        fetchUrl="/api/ecommerce/products?sort=newest&limit=12"
      />
    </div>
  );
}
