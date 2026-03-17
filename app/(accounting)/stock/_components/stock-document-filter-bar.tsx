"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Space, Select, Input, Button, DatePicker } from "antd";
import { SearchOutlined, ReloadOutlined } from "@ant-design/icons";
import type { StockDocumentFilters } from "@/lib/domain/stock-documents/parse-filters";
import {
  serializeStockDocumentFilters,
  defaultStockDocumentFilters,
} from "@/lib/domain/stock-documents/parse-filters";
import dayjs from "dayjs";

interface Warehouse {
  id: string;
  name: string;
}

interface StockDocumentFilterBarProps {
  initialFilters: StockDocumentFilters;
  warehouses: Warehouse[];
}

/**
 * Stock document filter bar — URL-driven filters with debounced search.
 *
 * Filters: search, status, warehouseId, dateFrom, dateTo.
 *
 * No data fetching — page.tsx handles that via server render.
 */
export function StockDocumentFilterBar({
  initialFilters,
  warehouses,
}: StockDocumentFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(initialFilters.search ?? "");
  const [status, setStatus] = useState<string | undefined>(initialFilters.status);
  const [warehouseId, setWarehouseId] = useState<string | undefined>(
    initialFilters.warehouseId
  );
  const [dateFrom, setDateFrom] = useState<string | undefined>(initialFilters.dateFrom);
  const [dateTo, setDateTo] = useState<string | undefined>(initialFilters.dateTo);

  // antd Select with showSearch generates internal <input id> via counter
  // which diverges between SSR and client — suppress until mounted
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const updateUrl = useCallback(
    (updates: Partial<StockDocumentFilters>) => {
      const current: StockDocumentFilters = {
        search: debouncedSearch || undefined,
        status,
        warehouseId,
        dateFrom,
        dateTo,
        type: initialFilters.type, // preserve type tab from URL
        page: 1, // Reset to first page on filter change
        pageSize: initialFilters.pageSize,
        sort: initialFilters.sort,
        order: initialFilters.order,
      };

      const next = { ...current, ...updates };
      const params = serializeStockDocumentFilters(
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
      warehouseId,
      dateFrom,
      dateTo,
      initialFilters.type,
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
    const v = value || undefined;
    setStatus(v);
    updateUrl({ status: v });
  };

  const handleWarehouseChange = (value: string | null) => {
    const v = value || undefined;
    setWarehouseId(v);
    updateUrl({ warehouseId: v });
  };

  const handleDateFromChange = (date: dayjs.Dayjs | null) => {
    const v = date ? date.format("YYYY-MM-DD") : undefined;
    setDateFrom(v);
    updateUrl({ dateFrom: v });
  };

  const handleDateToChange = (date: dayjs.Dayjs | null) => {
    const v = date ? date.format("YYYY-MM-DD") : undefined;
    setDateTo(v);
    updateUrl({ dateTo: v });
  };

  const handleReset = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatus(undefined);
    setWarehouseId(undefined);
    setDateFrom(undefined);
    setDateTo(undefined);

    const params = new URLSearchParams();
    if (initialFilters.type) params.set("type", initialFilters.type);
    params.set("page", String(defaultStockDocumentFilters.page));
    params.set("pageSize", String(defaultStockDocumentFilters.pageSize));

    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const hasFilters =
    search || status || warehouseId || dateFrom || dateTo;

  const statusOptions = [
    { value: "draft", label: "Черновик" },
    { value: "confirmed", label: "Подтверждён" },
    { value: "cancelled", label: "Отменён" },
  ];

  const warehouseOptions = warehouses.map((w) => ({
    value: w.id,
    label: w.name,
  }));

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
      <Space wrap>
        {/* Search by number */}
        <Input
          placeholder="Поиск по номеру..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          prefix={<SearchOutlined />}
          style={{ width: 200 }}
          allowClear
        />

        {/* Status — suppressed until mounted to avoid antd Select id mismatch */}
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

        {/* Warehouse — suppressed until mounted to avoid antd Select id mismatch */}
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

      {hasFilters && (
        <Button icon={<ReloadOutlined />} onClick={handleReset}>
          Сбросить
        </Button>
      )}
    </div>
  );
}
