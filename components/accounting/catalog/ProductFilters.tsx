"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Search, X, ChevronDown, ChevronUp } from "lucide-react";

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
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по названию, артикулу..."
            value={filters.search}
            onChange={(e) => updateFilter("search", e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={filters.categoryId} onValueChange={(v) => updateFilter("categoryId", v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Все категории" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Все категории</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.active} onValueChange={(v) => updateFilter("active", v)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Все статусы" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Все статусы</SelectItem>
            <SelectItem value="true">Активные</SelectItem>
            <SelectItem value="false">В архиве</SelectItem>
          </SelectContent>
        </Select>

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
          <Select value={filters.published} onValueChange={(v) => updateFilter("published", v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Публикация" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Любая публикация</SelectItem>
              <SelectItem value="true">На сайте</SelectItem>
              <SelectItem value="false">Не на сайте</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.variantStatus} onValueChange={(v) => updateFilter("variantStatus", v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Статус варианта" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Все товары</SelectItem>
              <SelectItem value="masters">Только мастер-товары</SelectItem>
              <SelectItem value="variants">Только варианты</SelectItem>
              <SelectItem value="unlinked">Несвязанные</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Checkbox
              id="hasDiscount"
              checked={filters.hasDiscount}
              onCheckedChange={(checked) => updateFilter("hasDiscount", checked === true)}
            />
            <Label htmlFor="hasDiscount" className="text-sm cursor-pointer">
              Со скидкой
            </Label>
          </div>
        </div>
      )}
    </div>
  );
}
