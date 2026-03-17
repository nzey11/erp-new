"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Space, Select, Input, Button, DatePicker } from "antd";
import { SearchOutlined, ReloadOutlined } from "@ant-design/icons";
import type { SalesFilters } from "@/lib/domain/sales/parse-filters";
import {
  serializeSalesFilters,
  defaultSalesFilters,
} from "@/lib/domain/sales/parse-filters";
import dayjs from "dayjs";

interface Counterparty {
  id: string;
  name: string;
}

interface SalesFilterBarProps {
  initialFilters: SalesFilters;
  counterparties: Counterparty[];
}

/**
 * Sales filter bar — URL-driven filters for the three simple sales tabs.
 * Filters: search, status, dateFrom, dateTo, counterpartyId.
 *
 * Does NOT control the tab — tab is driven by sales-page-client.
 * Does NOT apply to sales_order or profitability tabs (handled client-side).
 */
export function SalesFilterBar({
  initialFilters,
  counterparties,
}: SalesFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(initialFilters.search ?? "");
  const [status, setStatus] = useState<string | undefined>(initialFilters.status);
  const [dateFrom, setDateFrom] = useState<string | undefined>(initialFilters.dateFrom);
  const [dateTo, setDateTo] = useState<string | undefined>(initialFilters.dateTo);
  const [counterpartyId, setCounterpartyId] = useState<string | undefined>(
    initialFilters.counterpartyId
  );

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
    (updates: Partial<SalesFilters>) => {
      const current: SalesFilters = {
        search: debouncedSearch || undefined,
        tab: initialFilters.tab, // preserve tab from URL
        status,
        dateFrom,
        dateTo,
        counterpartyId,
        page: 1,
        pageSize: initialFilters.pageSize,
        sort: initialFilters.sort,
        order: initialFilters.order,
      };
      const next = { ...current, ...updates };
      const params = serializeSalesFilters(
        next,
        new URLSearchParams(searchParams.toString())
      );
      params.forEach((value, key) => {
        if (!value || value === "undefined") params.delete(key);
      });
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [
      router, searchParams, debouncedSearch, status,
      dateFrom, dateTo, counterpartyId, initialFilters,
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

  const handleCounterpartyChange = (value: string | null) => {
    const v = value || undefined;
    setCounterpartyId(v);
    updateUrl({ counterpartyId: v });
  };

  const handleReset = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatus(undefined);
    setDateFrom(undefined);
    setDateTo(undefined);
    setCounterpartyId(undefined);

    const params = new URLSearchParams();
    if (initialFilters.tab) params.set("tab", initialFilters.tab);
    params.set("page", String(defaultSalesFilters.page));
    params.set("pageSize", String(defaultSalesFilters.pageSize));
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const hasFilters = search || status || dateFrom || dateTo || counterpartyId;

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
            style={{ width: 160 }}
            options={statusOptions}
          />
        ) : (
          <div style={{ width: 160, height: 32 }} />
        )}

        {/* Counterparty — suppressed until mounted to avoid antd Select id mismatch */}
        {mounted ? (
          <Select
            placeholder="Контрагент"
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

      {hasFilters && (
        <Button icon={<ReloadOutlined />} onClick={handleReset}>
          Сбросить
        </Button>
      )}
    </div>
  );
}
