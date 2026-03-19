"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, Checkbox, Input } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { X, ChevronDown, ChevronUp } from "lucide-react";

interface Category {
  id: string;
  name: string;
  parentId: string | null;
}

export interface ProductFilters {
  search: string;
  categoryId: string;
  active: string;
  published: string;
  hasDiscount: boolean;
  variantStatus: string; // "all" | "masters" | "variants" | "unlinked"
  sortBy: string;
  sortOrder: string;
}

interface ProductFiltersProps {
  filters: ProductFilters;
  categories: Category[];
  onFiltersChange: (filters: ProductFilters) => void;
  onReset: () => void;
}

// Use special value for "all" since Radix Select doesn't allow empty strings
const ALL_VALUE = "__all__";

export const defaultFilters: ProductFilters = {
  search: "",
  categoryId: ALL_VALUE,
  active: ALL_VALUE,
  published: ALL_VALUE,
  hasDiscount: false,
  variantStatus: ALL_VALUE,
  sortBy: "name",
  sortOrder: "asc",
};

// Convert filter value for API (replace __all__ with empty string)
export const toApiValue = (value: string): string => value === ALL_VALUE ? "" : value;

export function ProductFiltersBar({
  filters,
  categories,
  onFiltersChange,
  onReset,
}: ProductFiltersProps) {
  const [showMore, setShowMore] = useState(false);

  const updateFilter = <K extends keyof ProductFilters>(key: K, value: ProductFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const hasActiveFilters = 
    filters.categoryId !== ALL_VALUE ||
    filters.active !== ALL_VALUE ||
    filters.published !== ALL_VALUE ||
    filters.variantStatus !== ALL_VALUE ||
    filters.hasDiscount;

  return (
    <div className="space-y-3">
      {/* Main filter row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px] max-w-sm">
          <Input
            prefix={<SearchOutlined className="text-muted-foreground" />}
            placeholder="Поиск по названию, артикулу..."
            value={filters.search}
            onChange={(e) => updateFilter("search", e.target.value)}
            allowClear
          />
        </div>

        <Select
          value={filters.categoryId}
          onChange={(v) => updateFilter("categoryId", v)}
          placeholder="Все категории"
          style={{ width: 180 }}
          options={[
            { value: ALL_VALUE, label: "Все категории" },
            ...categories.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />

        <Select
          value={filters.active}
          onChange={(v) => updateFilter("active", v)}
          placeholder="Все статусы"
          style={{ width: 140 }}
          options={[
            { value: ALL_VALUE, label: "Все статусы" },
            { value: "true", label: "Активные" },
            { value: "false", label: "В архиве" },
          ]}
        />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowMore(!showMore)}
          className="text-muted-foreground"
        >
          {showMore ? (
            <>Меньше <ChevronUp className="h-4 w-4 ml-1" /></>
          ) : (
            <>Ещё фильтры <ChevronDown className="h-4 w-4 ml-1" /></>
          )}
        </Button>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={onReset} className="text-muted-foreground">
            <X className="h-4 w-4 mr-1" /> Сбросить
          </Button>
        )}
      </div>

      {/* Extended filters */}
      {showMore && (
        <div className="flex items-center gap-4 pt-2 border-t flex-wrap">
          <Select
            value={filters.published}
            onChange={(v) => updateFilter("published", v)}
            placeholder="Публикация"
            style={{ width: 160 }}
            options={[
              { value: ALL_VALUE, label: "Любая публикация" },
              { value: "true", label: "На сайте" },
              { value: "false", label: "Не на сайте" },
            ]}
          />

          <Select
            value={filters.variantStatus}
            onChange={(v) => updateFilter("variantStatus", v)}
            placeholder="Статус варианта"
            style={{ width: 180 }}
            options={[
              { value: ALL_VALUE, label: "Все товары" },
              { value: "masters", label: "Только мастер-товары" },
              { value: "variants", label: "Только варианты" },
              { value: "unlinked", label: "Несвязанные" },
            ]}
          />

          <Checkbox
            checked={filters.hasDiscount}
            onChange={(e) => updateFilter("hasDiscount", e.target.checked)}
          >
            Со скидкой
          </Checkbox>
        </div>
      )}
    </div>
  );
}
