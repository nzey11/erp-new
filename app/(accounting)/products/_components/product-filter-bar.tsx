"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Space, Select, Input, Button } from "antd";
import { SearchOutlined, ReloadOutlined } from "@ant-design/icons";
import type { ProductFilters, VariantStatus } from "@/lib/domain/products/parse-filters";
import {
  serializeProductFilters,
  defaultProductFilters,
} from "@/lib/domain/products/parse-filters";

interface Category {
  id: string;
  name: string;
}

interface ProductFilterBarProps {
  initialFilters: ProductFilters;
  categories: Category[];
}

/**
 * Product filter bar — URL-driven filters with debounced search.
 *
 * Responsibilities:
 * - Read current filters from URL
 * - Update URL on filter change (router.replace)
 * - Debounce text search input
 * - Reset filters to defaults
 *
 * No data fetching — page.tsx handles that via server render.
 */
export function ProductFilterBar({
  initialFilters,
  categories,
}: ProductFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Local state for immediate UI feedback
  const [search, setSearch] = useState(initialFilters.search || "");
  const [categoryId, setCategoryId] = useState<string | undefined>(initialFilters.categoryId);
  const [isActive, setIsActive] = useState<boolean | undefined>(initialFilters.isActive);
  const [published, setPublished] = useState<boolean | undefined>(initialFilters.published);
  const [variantStatus, setVariantStatus] = useState<VariantStatus | undefined>(initialFilters.variantStatus);
  const [hasDiscount, setHasDiscount] = useState<boolean | undefined>(initialFilters.hasDiscount);
  // antd Select with showSearch generates internal <input id> via counter
  // which diverges between SSR and client — suppress until mounted
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Debounced search state
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Update URL when filters change
  const updateUrl = useCallback(
    (updates: Partial<ProductFilters>) => {
      const current: ProductFilters = {
        search: debouncedSearch || undefined,
        categoryId,
        isActive,
        published,
        variantStatus,
        hasDiscount,
        page: 1, // Reset to first page on filter change
        pageSize: initialFilters.pageSize,
        sort: initialFilters.sort,
        order: initialFilters.order,
      };

      const next = { ...current, ...updates };
      const params = serializeProductFilters(
        next,
        new URLSearchParams(searchParams.toString())
      );

      // Remove empty/default values for cleaner URL
      params.forEach((value, key) => {
        if (!value || value === "undefined") {
          params.delete(key);
        }
      });

      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [
      router,
      searchParams,
      debouncedSearch,
      categoryId,
      isActive,
      published,
      variantStatus,
      hasDiscount,
      initialFilters,
    ]
  );

  // Trigger URL update on debounced search change
  useEffect(() => {
    updateUrl({ search: debouncedSearch || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const handleCategoryChange = (value: string | null) => {
    const newValue = value || undefined;
    setCategoryId(newValue);
    updateUrl({ categoryId: newValue });
  };

  const handleStatusChange = (value: boolean | null) => {
    const newValue = value ?? undefined;
    setIsActive(newValue);
    updateUrl({ isActive: newValue });
  };

  const handlePublishedChange = (value: boolean | null) => {
    const newValue = value ?? undefined;
    setPublished(newValue);
    updateUrl({ published: newValue });
  };

  const handleVariantStatusChange = (value: VariantStatus | null) => {
    const newValue = value || undefined;
    setVariantStatus(newValue);
    updateUrl({ variantStatus: newValue });
  };

  const handleDiscountChange = (value: boolean | null) => {
    const newValue = value ?? undefined;
    setHasDiscount(newValue);
    updateUrl({ hasDiscount: newValue });
  };

  const handleReset = () => {
    setSearch("");
    setDebouncedSearch("");
    setCategoryId(undefined);
    setIsActive(undefined);
    setPublished(undefined);
    setVariantStatus(undefined);
    setHasDiscount(undefined);

    const params = new URLSearchParams();
    params.set("page", String(defaultProductFilters.page));
    params.set("pageSize", String(defaultProductFilters.pageSize));
    params.set("sort", String(defaultProductFilters.sort));
    params.set("order", String(defaultProductFilters.order));

    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const hasFilters =
    search ||
    categoryId !== undefined ||
    isActive !== undefined ||
    published !== undefined ||
    variantStatus !== undefined ||
    hasDiscount !== undefined;

  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
      <Space wrap>
        {/* Search input */}
        <Input
          placeholder="Поиск по названию, артикулу, штрих-коду..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          prefix={<SearchOutlined />}
          style={{ width: 300 }}
          allowClear
        />

        {/* Category filter — suppressed until mounted to avoid antd showSearch id mismatch */}
        {mounted ? (
          <Select
            placeholder="Категория"
            value={categoryId}
            onChange={handleCategoryChange}
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: 180 }}
            options={categoryOptions}
          />
        ) : (
          <div style={{ width: 180, height: 32 }} />
        )}

        {/* Active status filter — suppressed until mounted to avoid antd Select id mismatch */}
        {mounted ? (
          <Select
            placeholder="Статус"
            value={isActive}
            onChange={handleStatusChange}
            allowClear
            style={{ width: 140 }}
            options={[
              { value: true, label: "Активен" },
              { value: false, label: "В архиве" },
            ]}
          />
        ) : (
          <div style={{ width: 140, height: 32 }} />
        )}

        {/* Published filter — suppressed until mounted to avoid antd Select id mismatch */}
        {mounted ? (
          <Select
            placeholder="На сайте"
            value={published}
            onChange={handlePublishedChange}
            allowClear
            style={{ width: 140 }}
            options={[
              { value: true, label: "На сайте" },
              { value: false, label: "Не на сайте" },
            ]}
          />
        ) : (
          <div style={{ width: 140, height: 32 }} />
        )}

        {/* Variant status filter — suppressed until mounted to avoid antd Select id mismatch */}
        {mounted ? (
          <Select
            placeholder="Тип товара"
            value={variantStatus}
            onChange={handleVariantStatusChange}
            allowClear
            style={{ width: 180 }}
            options={[
              { value: "masters", label: "Мастер-товары" },
              { value: "variants", label: "Только варианты" },
              { value: "unlinked", label: "Несвязанные" },
            ]}
          />
        ) : (
          <div style={{ width: 180, height: 32 }} />
        )}

        {/* Discount filter — suppressed until mounted to avoid antd Select id mismatch */}
        {mounted ? (
          <Select
            placeholder="Скидка"
            value={hasDiscount}
            onChange={handleDiscountChange}
            allowClear
            style={{ width: 140 }}
            options={[
              { value: true, label: "Со скидкой" },
            ]}
          />
        ) : (
          <div style={{ width: 140, height: 32 }} />
        )}
      </Space>

      {/* Reset button */}
      {hasFilters && (
        <Button icon={<ReloadOutlined />} onClick={handleReset}>
          Сбросить
        </Button>
      )}
    </div>
  );
}
