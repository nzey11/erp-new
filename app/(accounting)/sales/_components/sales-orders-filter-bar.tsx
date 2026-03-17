"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Space, Select, Input, Button, DatePicker } from "antd";
import { SearchOutlined, ReloadOutlined } from "@ant-design/icons";
import type { SalesOrderFilters } from "@/lib/domain/sales-orders/parse-filters";
import {
  serializeSalesOrderFilters,
  defaultSalesOrderFilters,
} from "@/lib/domain/sales-orders/parse-filters";
import dayjs from "dayjs";

interface SalesOrdersFilterBarProps {
  initialFilters: SalesOrderFilters;
}

/**
 * Sales orders filter bar — URL-driven filters for the sales_order tab.
 * Filters: search, status, paymentStatus, source, dateFrom, dateTo.
 */
export function SalesOrdersFilterBar({
  initialFilters,
}: SalesOrdersFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(initialFilters.search ?? "");
  const [status, setStatus] = useState<string | undefined>(initialFilters.status);
  const [paymentStatus, setPaymentStatus] = useState<string | undefined>(
    initialFilters.paymentStatus
  );
  const [source, setSource] = useState<"all" | "ecom" | "manual">(
    initialFilters.source ?? "all"
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
    (updates: Partial<SalesOrderFilters>) => {
      const current: SalesOrderFilters = {
        search: debouncedSearch || undefined,
        status,
        paymentStatus,
        source,
        dateFrom,
        dateTo,
        page: 1,
        pageSize: initialFilters.pageSize,
        sort: initialFilters.sort,
        order: initialFilters.order,
      };
      const next = { ...current, ...updates };
      const params = serializeSalesOrderFilters(
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
      paymentStatus, source, dateFrom, dateTo, initialFilters,
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

  const handlePaymentStatusChange = (value: string | null) => {
    const v = value || undefined;
    setPaymentStatus(v);
    updateUrl({ paymentStatus: v });
  };

  const handleSourceChange = (value: "all" | "ecom" | "manual") => {
    setSource(value);
    updateUrl({ source: value });
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
    setPaymentStatus(undefined);
    setSource("all");
    setDateFrom(undefined);
    setDateTo(undefined);

    const params = serializeSalesOrderFilters({
      ...defaultSalesOrderFilters,
      page: 1,
    });
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const hasFilters = search || status || paymentStatus || source !== "all" || dateFrom || dateTo;

  const statusOptions = [
    { value: "pending", label: "Ожидает" },
    { value: "paid", label: "Оплачен" },
    { value: "processing", label: "В работе" },
    { value: "shipped", label: "Отправлен" },
    { value: "delivered", label: "Доставлен" },
    { value: "cancelled", label: "Отменён" },
  ];

  const paymentStatusOptions = [
    { value: "pending", label: "Ожидает оплаты" },
    { value: "paid", label: "Оплачен" },
    { value: "failed", label: "Ошибка оплаты" },
    { value: "refunded", label: "Возврат" },
  ];

  const sourceOptions = [
    { value: "all", label: "Все заказы" },
    { value: "ecom", label: "Интернет-магазин" },
    { value: "manual", label: "Менеджер" },
  ];

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

        {/* Ecom Status — suppressed until mounted to avoid antd Select id mismatch */}
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

        {/* Payment Status — suppressed until mounted to avoid antd Select id mismatch */}
        {mounted ? (
          <Select
            placeholder="Статус оплаты"
            value={paymentStatus}
            onChange={handlePaymentStatusChange}
            allowClear
            style={{ width: 160 }}
            options={paymentStatusOptions}
          />
        ) : (
          <div style={{ width: 160, height: 32 }} />
        )}

        {/* Source filter — suppressed until mounted to avoid antd Select id mismatch */}
        {mounted ? (
          <Select
            placeholder="Источник"
            value={source}
            onChange={handleSourceChange}
            style={{ width: 160 }}
            options={sourceOptions}
          />
        ) : (
          <div style={{ width: 160, height: 32 }} />
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
