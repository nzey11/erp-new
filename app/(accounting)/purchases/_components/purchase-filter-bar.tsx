"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Space, Select, Input, Button, DatePicker } from "antd";
import { SearchOutlined, ReloadOutlined } from "@ant-design/icons";
import type { PurchaseFilters } from "@/lib/domain/purchases/parse-filters";
import {
  serializeFilters,
  defaultPurchaseFilters,
} from "@/lib/domain/purchases/parse-filters";
import dayjs from "dayjs";

interface Counterparty {
  id: string;
  name: string;
}

interface PurchaseFilterBarProps {
  initialFilters: PurchaseFilters;
  counterparties: Counterparty[];
}

/**
 * Purchase filter bar — URL-driven filters with debounced search.
 *
 * Responsibilities:
 * - Read current filters from URL
 * - Update URL on filter change (router.replace)
 * - Debounce text search input (400ms)
 * - Reset filters to defaults
 *
 * No data fetching — page.tsx handles that via server render.
 */
export function PurchaseFilterBar({
  initialFilters,
  counterparties,
}: PurchaseFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Local state for immediate UI feedback
  const [search, setSearch] = useState(initialFilters.search ?? "");
  const [status, setStatus] = useState<string | undefined>(
    initialFilters.status
  );
  const [counterpartyId, setCounterpartyId] = useState<string | undefined>(
    initialFilters.counterpartyId
  );
  const [dateFrom, setDateFrom] = useState<string | undefined>(
    initialFilters.dateFrom
  );
  const [dateTo, setDateTo] = useState<string | undefined>(
    initialFilters.dateTo
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
    (updates: Partial<PurchaseFilters>) => {
      const current: PurchaseFilters = {
        search: debouncedSearch || undefined,
        status,
        counterpartyId,
        dateFrom,
        dateTo,
        page: 1, // Reset to first page on filter change
        pageSize: initialFilters.pageSize,
        sort: initialFilters.sort,
        order: initialFilters.order,
      };

      const next = { ...current, ...updates };
      const params = serializeFilters(
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
      debouncedSearch,
      status,
      counterpartyId,
      dateFrom,
      dateTo,
      initialFilters.pageSize,
      initialFilters.sort,
      initialFilters.order,
    ]
  );

  // Trigger URL update on debounced search change
  useEffect(() => {
    updateUrl({ search: debouncedSearch || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const handleStatusChange = (value: string | null) => {
    const newValue = value || undefined;
    setStatus(newValue);
    updateUrl({ status: newValue });
  };

  const handleCounterpartyChange = (value: string | null) => {
    const newValue = value || undefined;
    setCounterpartyId(newValue);
    updateUrl({ counterpartyId: newValue });
  };

  const handleDateFromChange = (date: dayjs.Dayjs | null) => {
    const newValue = date ? date.format("YYYY-MM-DD") : undefined;
    setDateFrom(newValue);
    updateUrl({ dateFrom: newValue });
  };

  const handleDateToChange = (date: dayjs.Dayjs | null) => {
    const newValue = date ? date.format("YYYY-MM-DD") : undefined;
    setDateTo(newValue);
    updateUrl({ dateTo: newValue });
  };

  const handleReset = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatus(undefined);
    setCounterpartyId(undefined);
    setDateFrom(undefined);
    setDateTo(undefined);

    const params = new URLSearchParams();
    params.set("page", String(defaultPurchaseFilters.page));
    params.set("pageSize", String(defaultPurchaseFilters.pageSize));

    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const hasFilters =
    search || status || counterpartyId || dateFrom || dateTo;

  const statusOptions = [
    { value: "draft", label: "Черновик" },
    { value: "confirmed", label: "Подтверждён" },
    { value: "cancelled", label: "Отменён" },
  ];

  const counterpartyOptions = counterparties.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
      <Space wrap>
        {/* Search input */}
        <Input
          placeholder="Поиск по номеру..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          prefix={<SearchOutlined />}
          style={{ width: 200 }}
          allowClear
        />

        {/* Status filter — suppressed until mounted to avoid antd Select id mismatch */}
        {mounted ? (
          <Select
            placeholder="Все статусы"
            value={status}
            onChange={handleStatusChange}
            allowClear
            style={{ width: 150 }}
            options={statusOptions}
          />
        ) : (
          <div style={{ width: 150, height: 32 }} />
        )}

        {/* Counterparty filter — suppressed until mounted to avoid antd Select id mismatch */}
        {mounted ? (
          <Select
            placeholder="Все поставщики"
            value={counterpartyId}
            onChange={handleCounterpartyChange}
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: 220 }}
            options={counterpartyOptions}
          />
        ) : (
          <div style={{ width: 220, height: 32 }} />
        )}

        {/* Date range */}
        <DatePicker
          placeholder="Дата с"
          value={dateFrom ? dayjs(dateFrom) : null}
          onChange={handleDateFromChange}
          format="DD.MM.YYYY"
        />
        <DatePicker
          placeholder="Дата по"
          value={dateTo ? dayjs(dateTo) : null}
          onChange={handleDateToChange}
          format="DD.MM.YYYY"
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
