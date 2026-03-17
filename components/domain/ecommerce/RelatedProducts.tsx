"use client";

import { useState, useEffect } from "react";
import { ProductCard, type ProductCardData } from "./ProductCard";

interface RelatedProductsProps {
  slug: string;
}

export function RelatedProducts({ slug }: RelatedProductsProps) {
  const [products, setProducts] = useState<ProductCardData[]>([]);

  useEffect(() => {
    const fetchRelated = async () => {
      try {
        const res = await fetch(`/api/ecommerce/products/${slug}/related`);
        if (res.ok) {
          const data = await res.json();
          setProducts(data.data || []);
        }
      } catch {
        // Ignore
      }
    };
    if (slug) fetchRelated();
  }, [slug]);

  if (products.length === 0) return null;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Похожие товары</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
