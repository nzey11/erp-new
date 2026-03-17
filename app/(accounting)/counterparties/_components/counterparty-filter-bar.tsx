"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Space, Select, Input, Button } from "antd";
import { SearchOutlined, ReloadOutlined } from "@ant-design/icons";
import type { CounterpartyFilters } from "@/lib/domain/counterparties/parse-filters";
import {
  serializeCounterpartyFilters,
  defaultCounterpartyFilters,
} from "@/lib/domain/counterparties/parse-filters";

interface CounterpartyFilterBarProps {
  initialFilters: CounterpartyFilters;
}

/**
 * Counterparty filter bar — URL-driven filters with debounced search.
 *
 * Responsibilities:
 * - Read current filters from URL
 * - Update URL on filter change (router.replace)
 * - Debounce text search input
 * - Reset filters to defaults
 *
 * No data fetching — page.tsx handles that via server render.
 */
export function CounterpartyFilterBar({
  initialFilters,
}: CounterpartyFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Local state for immediate UI feedback
  const [type, setType] = useState<string | undefined>(initialFilters.type);
  const [isActive, setIsActive] = useState<boolean | undefined>(
    initialFilters.isActive
  );
  const [search, setSearch] = useState(initialFilters.search || "");

  // antd Select generates internal <input id> via counter
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
    (updates: Partial<CounterpartyFilters>) => {
      const current: CounterpartyFilters = {
        type: type as "customer" | "supplier" | "both" | undefined,
        isActive,
        search: debouncedSearch || undefined,
        page: 1, // Reset to first page on filter change
        pageSize: initialFilters.pageSize,
        sort: initialFilters.sort,
        order: initialFilters.order,
      };

      const next = { ...current, ...updates };
      const params = serializeCounterpartyFilters(
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
    [
      router,
      searchParams,
      type,
      isActive,
      debouncedSearch,
      initialFilters,
    ]
  );

  // Trigger URL update on debounced search change
  useEffect(() => {
    updateUrl({ search: debouncedSearch || undefined });
  }, [debouncedSearch, updateUrl]);

  const handleTypeChange = (value: string | null) => {
    const newType = value || undefined;
    setType(newType);
    updateUrl({ type: newType as "customer" | "supplier" | "both" });
  };

  const handleStatusChange = (value: boolean | null) => {
    const newStatus = value ?? undefined;
    setIsActive(newStatus);
    updateUrl({ isActive: newStatus });
  };

  const handleReset = () => {
    setType(undefined);
    setIsActive(undefined);
    setSearch("");
    setDebouncedSearch("");

    const params = new URLSearchParams();
    params.set("page", String(defaultCounterpartyFilters.page));
    params.set("pageSize", String(defaultCounterpartyFilters.pageSize));
    params.set("sort", String(defaultCounterpartyFilters.sort));
    params.set("order", String(defaultCounterpartyFilters.order));

    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const hasFilters = type !== undefined || isActive !== undefined || search;

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
      <Space wrap>
        {/* Type filter — suppressed until mounted to avoid antd Select id mismatch */}
        {mounted ? (
          <Select
            placeholder="Тип контрагента"
            value={type}
            onChange={handleTypeChange}
            allowClear
            style={{ width: 180 }}
            options={[
              { value: "customer", label: "Покупатель" },
              { value: "supplier", label: "Поставщик" },
              { value: "both", label: "Покупатель/Поставщик" },
            ]}
          />
        ) : (
          <div style={{ width: 180, height: 32 }} />
        )}

        {/* Status filter — suppressed until mounted to avoid antd Select id mismatch */}
        {mounted ? (
          <Select
            placeholder="Статус"
            value={isActive}
            onChange={handleStatusChange}
            allowClear
            style={{ width: 140 }}
            options={[
              { value: true, label: "Активен" },
              { value: false, label: "Неактивен" },
            ]}
          />
        ) : (
          <div style={{ width: 140, height: 32 }} />
        )}

        {/* Search input */}
        <Input
          placeholder="Поиск по названию, ИНН, телефону..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          prefix={<SearchOutlined />}
          style={{ width: 320 }}
          allowClear
        />
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
