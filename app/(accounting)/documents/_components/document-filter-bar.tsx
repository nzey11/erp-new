"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Space, Select, Input, Button, DatePicker } from "antd";
import { SearchOutlined, ReloadOutlined } from "@ant-design/icons";
import type { DocumentFilters } from "@/lib/domain/documents/parse-filters";
import {
  serializeDocumentFilters,
  defaultDocumentFilters,
} from "@/lib/domain/documents/parse-filters";
import dayjs from "dayjs";

interface Counterparty {
  id: string;
  name: string;
}

interface Warehouse {
  id: string;
  name: string;
}

interface DocumentFilterBarProps {
  initialFilters: DocumentFilters;
  counterparties: Counterparty[];
  warehouses: Warehouse[];
}

/**
 * Document filter bar — URL-driven filters with debounced search.
 *
 * Filters: search, group (tab), type, status, dateFrom, dateTo,
 *          counterpartyId, warehouseId.
 *
 * No data fetching — page.tsx handles that via server render.
 */
export function DocumentFilterBar({
  initialFilters,
  counterparties,
  warehouses,
}: DocumentFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(initialFilters.search ?? "");
  const [status, setStatus] = useState<string | undefined>(initialFilters.status);
  const [type, setType] = useState<string | undefined>(initialFilters.type);
  const [dateFrom, setDateFrom] = useState<string | undefined>(initialFilters.dateFrom);
  const [dateTo, setDateTo] = useState<string | undefined>(initialFilters.dateTo);
  const [counterpartyId, setCounterpartyId] = useState<string | undefined>(
    initialFilters.counterpartyId
  );
  const [warehouseId, setWarehouseId] = useState<string | undefined>(
    initialFilters.warehouseId
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
    (updates: Partial<DocumentFilters>) => {
      const current: DocumentFilters = {
        search: debouncedSearch || undefined,
        status,
        type,
        dateFrom,
        dateTo,
        counterpartyId,
        warehouseId,
        group: initialFilters.group, // preserve group tab from URL
        page: 1,
        pageSize: initialFilters.pageSize,
        sort: initialFilters.sort,
        order: initialFilters.order,
      };
      const next = { ...current, ...updates };
      const params = serializeDocumentFilters(
        next,
        new URLSearchParams(searchParams.toString())
      );
      params.forEach((value, key) => {
        if (!value || value === "undefined") params.delete(key);
      });
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [
      router, searchParams, debouncedSearch, status, type,
      dateFrom, dateTo, counterpartyId, warehouseId, initialFilters,
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

  const handleTypeChange = (value: string | null) => {
    const v = value || undefined;
    setType(v);
    updateUrl({ type: v });
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

  const handleWarehouseChange = (value: string | null) => {
    const v = value || undefined;
    setWarehouseId(v);
    updateUrl({ warehouseId: v });
  };

  const handleReset = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatus(undefined);
    setType(undefined);
    setDateFrom(undefined);
    setDateTo(undefined);
    setCounterpartyId(undefined);
    setWarehouseId(undefined);

    const params = new URLSearchParams();
    if (initialFilters.group) params.set("group", initialFilters.group);
    params.set("page", String(defaultDocumentFilters.page));
    params.set("pageSize", String(defaultDocumentFilters.pageSize));
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const hasFilters =
    search || status || type || dateFrom || dateTo || counterpartyId || warehouseId;

  const statusOptions = [
    { value: "draft", label: "Черновик" },
    { value: "confirmed", label: "Подтверждён" },
    { value: "cancelled", label: "Отменён" },
  ];

  const counterpartyOptions = counterparties.map((c) => ({
    value: c.id,
    label: c.name,
  }));

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

        {/* Type — suppressed until mounted to avoid antd Select id mismatch */}
        {mounted ? (
          <Select
            placeholder="Все типы"
            value={type}
            onChange={handleTypeChange}
            allowClear
            style={{ width: 200 }}
            options={[
              { label: "Склад", options: [
                { value: "stock_receipt", label: "Оприходование" },
                { value: "write_off", label: "Списание" },
                { value: "stock_transfer", label: "Перемещение" },
                { value: "inventory_count", label: "Инвентаризация" },
              ]},
              { label: "Закупки", options: [
                { value: "purchase_order", label: "Заказ поставщику" },
                { value: "incoming_shipment", label: "Приёмка" },
                { value: "supplier_return", label: "Возврат поставщику" },
              ]},
              { label: "Продажи", options: [
                { value: "sales_order", label: "Заказ покупателя" },
                { value: "outgoing_shipment", label: "Отгрузка" },
                { value: "customer_return", label: "Возврат покупателя" },
              ]},
              { label: "Финансы", options: [
                { value: "incoming_payment", label: "Входящий платёж" },
                { value: "outgoing_payment", label: "Исходящий платёж" },
              ]},
            ]}
          />
        ) : (
          <div style={{ width: 200, height: 32 }} />
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

        {/* Warehouse — suppressed until mounted to avoid antd Select id mismatch */}
        {mounted ? (
          <Select
            placeholder="Склад"
            value={warehouseId}
            onChange={handleWarehouseChange}
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: 180 }}
            options={warehouseOptions}
          />
        ) : (
          <div style={{ width: 180, height: 32 }} />
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
