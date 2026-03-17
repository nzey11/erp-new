"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Space, Select, DatePicker, Input, Button } from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { SearchOutlined, ReloadOutlined } from "@ant-design/icons";
import type { PaymentFilters } from "@/lib/domain/payments/parse-filters";
import { serializePaymentFilters, defaultPaymentFilters } from "@/lib/domain/payments/parse-filters";

const { RangePicker } = DatePicker;

interface PaymentFilterBarProps {
  initialFilters: PaymentFilters;
}

/**
 * Payment filter bar — URL-driven filters with debounced search.
 *
 * Responsibilities:
 * - Read current filters from URL
 * - Update URL on filter change (router.replace)
 * - Debounce text search input
 * - Reset filters to defaults
 *
 * No data fetching — page.tsx handles that via server render.
 */
export function PaymentFilterBar({ initialFilters }: PaymentFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Local state for immediate UI feedback
  const [type, setType] = useState<"income" | "expense" | undefined>(initialFilters.type);
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(
    initialFilters.dateFrom && initialFilters.dateTo
      ? [dayjs(initialFilters.dateFrom), dayjs(initialFilters.dateTo)]
      : null
  );
  const [search, setSearch] = useState(initialFilters.search || "");

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
    (updates: Partial<PaymentFilters>) => {
      const current: PaymentFilters = {
        type,
        search: debouncedSearch || undefined,
        dateFrom: dateRange?.[0]?.format("YYYY-MM-DD"),
        dateTo: dateRange?.[1]?.format("YYYY-MM-DD"),
        page: 1, // Reset to first page on filter change
        pageSize: initialFilters.pageSize,
        sort: initialFilters.sort,
        order: initialFilters.order,
      };

      const next = { ...current, ...updates };
      const params = serializePaymentFilters(next, new URLSearchParams(searchParams.toString()));

      // Remove empty values for cleaner URL
      params.forEach((value, key) => {
        if (!value || value === "undefined") {
          params.delete(key);
        }
      });

      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams, type, dateRange, debouncedSearch, initialFilters]
  );

  // Trigger URL update on debounced search change
  useEffect(() => {
    updateUrl({ search: debouncedSearch || undefined });
  }, [debouncedSearch, updateUrl]);

  const handleTypeChange = (value: "income" | "expense" | null) => {
    setType(value || undefined);
    updateUrl({ type: value || undefined });
  };

  const handleDateChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    setDateRange(dates);
    updateUrl({
      dateFrom: dates?.[0]?.format("YYYY-MM-DD"),
      dateTo: dates?.[1]?.format("YYYY-MM-DD"),
    });
  };

  const handleReset = () => {
    setType(undefined);
    setDateRange(null);
    setSearch("");
    setDebouncedSearch("");

    const params = new URLSearchParams();
    params.set("page", String(defaultPaymentFilters.page));
    params.set("pageSize", String(defaultPaymentFilters.pageSize));
    params.set("sort", String(defaultPaymentFilters.sort));
    params.set("order", String(defaultPaymentFilters.order));

    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const hasFilters = type || dateRange || search;

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
      <Space wrap>
        {/* Type filter */}
        <Select
          placeholder="Тип платежа"
          value={type}
          onChange={handleTypeChange}
          allowClear
          style={{ width: 140 }}
          options={[
            { value: "income", label: "Приход" },
            { value: "expense", label: "Расход" },
          ]}
        />

        {/* Date range filter */}
        <RangePicker
          placeholder={["С даты", "По дату"]}
          value={dateRange}
          onChange={handleDateChange}
          format="DD.MM.YYYY"
        />

        {/* Search input */}
        <Input
          placeholder="Поиск по номеру, описанию..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          prefix={<SearchOutlined />}
          style={{ width: 280 }}
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
