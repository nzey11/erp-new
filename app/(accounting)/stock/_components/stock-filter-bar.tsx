"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Space, Select, Input, Button } from "antd";
import { SearchOutlined, ReloadOutlined } from "@ant-design/icons";
import type { StockFilters } from "@/lib/domain/stock/parse-filters";
import {
  serializeStockFilters,
  defaultStockFilters,
} from "@/lib/domain/stock/parse-filters";

interface Warehouse {
  id: string;
  name: string;
}

interface StockFilterBarProps {
  initialFilters: StockFilters;
  warehouses: Warehouse[];
}

/**
 * Stock balance filter bar — URL-driven filters with debounced search.
 *
 * Responsibilities:
 * - Read current filters from URL
 * - Update URL on filter change (router.replace)
 * - Debounce text search input (400ms)
 * - Reset filters to defaults
 *
 * No data fetching — page.tsx handles that via server render.
 */
export function StockFilterBar({
  initialFilters,
  warehouses,
}: StockFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Local state for immediate UI feedback
  const [search, setSearch] = useState(initialFilters.search ?? "");
  const [warehouseId, setWarehouseId] = useState<string | undefined>(
    initialFilters.warehouseId
  );
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
    (updates: Partial<StockFilters>) => {
      const current: StockFilters = {
        search: debouncedSearch || undefined,
        warehouseId,
        page: 1, // Reset to first page on filter change
        pageSize: initialFilters.pageSize,
      };

      const next = { ...current, ...updates };
      const params = serializeStockFilters(
        next,
        new URLSearchParams(searchParams.toString())
      );

      // Remove empty values for cleaner URL
      params.forEach((value, key) => {
        if (!value || value === "undefined") {
          params.delete(key);
        }
      });

      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams, debouncedSearch, warehouseId, initialFilters.pageSize]
  );

  // Trigger URL update on debounced search change
  useEffect(() => {
    updateUrl({ search: debouncedSearch || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const handleWarehouseChange = (value: string | null) => {
    const newValue = value || undefined;
    setWarehouseId(newValue);
    updateUrl({ warehouseId: newValue });
  };

  const handleReset = () => {
    setSearch("");
    setDebouncedSearch("");
    setWarehouseId(undefined);

    const params = new URLSearchParams();
    params.set("page", String(defaultStockFilters.page));
    params.set("pageSize", String(defaultStockFilters.pageSize));

    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const hasFilters = search || warehouseId !== undefined;

  const warehouseOptions = warehouses.map((w) => ({
    value: w.id,
    label: w.name,
  }));

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
      <Space wrap>
        {/* Search input */}
        <Input
          placeholder="Поиск по товару, артикулу..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          prefix={<SearchOutlined />}
          style={{ width: 280 }}
          allowClear
        />

        {/* Warehouse filter — suppressed until mounted to avoid antd Select id mismatch */}
        {mounted ? (
          <Select
            placeholder="Все склады"
            value={warehouseId}
            onChange={handleWarehouseChange}
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: 200 }}
            options={warehouseOptions}
          />
        ) : (
          <div style={{ width: 200, height: 32 }} />
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
