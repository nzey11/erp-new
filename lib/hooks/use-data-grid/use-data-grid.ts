"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { buildCacheKey, getCache, setCache, invalidateCache } from "./cache";
import { csrfFetch } from "@/lib/client/csrf";
import type { UseDataGridConfig, UseDataGridReturn } from "./types";

const defaultAdapter = (json: unknown): { data: unknown[]; total: number } => {
  if (Array.isArray(json)) return { data: json, total: json.length };
  const obj = json as Record<string, unknown>;
  const data = Array.isArray(obj.data) ? obj.data : [];
  const total = typeof obj.total === "number" ? obj.total : data.length;
  return { data, total };
};

export function useDataGrid<TData extends { id: string }>(
  config: UseDataGridConfig<TData>,
): UseDataGridReturn<TData> {
  const {
    endpoint,
    pageSize: initialPageSize = 50,
    enablePagination = true,
    enableSearch = true,
    searchDebounce = 300,
    sortable = false,
    defaultSort = null,
    defaultFilters = {},
    filterToParam,
    responseAdapter,
    dependencies = [],
    syncUrl = true,
    enablePageSizeChange = false,
    pageSizeOptions,
  } = config;

  const adapter = responseAdapter ?? (defaultAdapter as (json: unknown) => { data: TData[]; total: number });
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // --- Hydrate initial state from URL ---
  const initRef = useRef(false);

  const hydrateFromUrl = useCallback(() => {
    if (!syncUrl) return { p: 1, s: "", sortField: defaultSort?.field ?? "", sortOrder: (defaultSort?.order ?? "asc") as "asc" | "desc", f: { ...defaultFilters } };
    const p = Number(searchParams.get("page")) || 1;
    const s = searchParams.get("search") ?? "";
    const sortField = searchParams.get("sortBy") ?? defaultSort?.field ?? "";
    const sortOrder = (searchParams.get("sortOrder") as "asc" | "desc") ?? defaultSort?.order ?? "asc";

    const f: Record<string, string> = { ...defaultFilters };
    for (const key of Object.keys(defaultFilters)) {
      const urlVal = searchParams.get(key);
      if (urlVal !== null) f[key] = urlVal;
    }

    return { p, s, sortField, sortOrder, f };
  }, [searchParams, defaultFilters, defaultSort, syncUrl]);

  const initial = hydrateFromUrl();

  const [data, setData] = useState<TData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPageState] = useState(initial.p);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [searchInput, setSearchInput] = useState(initial.s);
  const [debouncedSearch, setDebouncedSearch] = useState(initial.s);
  const [filters, setFiltersState] = useState<Record<string, string>>(initial.f);
  const [sort, setSortState] = useState<{ field: string; order: "asc" | "desc" } | null>(
    initial.sortField ? { field: initial.sortField, order: initial.sortOrder } : defaultSort,
  );

  // --- Debounced search ---
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, searchDebounce);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchInput, searchDebounce]);

  // --- Build query params ---
  const buildParams = useCallback((): URLSearchParams => {
    const params = new URLSearchParams();
    if (enablePagination) {
      params.set("page", String(page));
      params.set("limit", String(pageSize));
    }
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (sort) {
      params.set("sortBy", sort.field);
      params.set("sortOrder", sort.order);
    }
    for (const [key, value] of Object.entries(filters)) {
      if (filterToParam) {
        const mapped = filterToParam(key, value);
        if (mapped !== null) params.set(key, mapped);
      } else if (value !== "") {
        params.set(key, value);
      }
    }
    return params;
  }, [page, pageSize, debouncedSearch, sort, filters, enablePagination, filterToParam]);

  // --- URL sync (debounced replace) ---
  const urlTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!syncUrl) return;
    if (!initRef.current) { initRef.current = true; return; }
    if (urlTimerRef.current) clearTimeout(urlTimerRef.current);
    urlTimerRef.current = setTimeout(() => {
      const params = buildParams();
      // Remove default/empty values to keep URL clean
      if (params.get("page") === "1") params.delete("page");
      params.delete("limit");
      if (!params.get("search")) params.delete("search");
      if (defaultSort && params.get("sortBy") === defaultSort.field && params.get("sortOrder") === defaultSort.order) {
        params.delete("sortBy");
        params.delete("sortOrder");
      }
      for (const [key, defaultVal] of Object.entries(defaultFilters)) {
        if (params.get(key) === defaultVal || params.get(key) === "") params.delete(key);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 100);
    return () => { if (urlTimerRef.current) clearTimeout(urlTimerRef.current); };
  }, [syncUrl, page, debouncedSearch, sort, filters, buildParams, pathname, router, defaultFilters, defaultSort]);

  // --- Fetch logic with cache ---
  const abortRef = useRef<AbortController | null>(null);
  const fetchIdRef = useRef(0);

  const fetchData = useCallback(async (bypassCache = false) => {
    const params = buildParams();
    const cacheKey = buildCacheKey(endpoint, params);
    const id = ++fetchIdRef.current;

    // Cache check
    if (!bypassCache) {
      const cached = getCache(cacheKey);
      if (cached) {
        setData(cached.data as TData[]);
        setTotal(cached.total);
        if (cached.fresh) { setLoading(false); return; }
        // Stale: show cached data, fetch in background
        setLoading(false);
      }
    }

    // Abort previous in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!getCache(cacheKey)) setLoading(true);

    try {
      const separator = endpoint.includes("?") ? "&" : "?";
      const res = await fetch(`${endpoint}${separator}${params}`, { signal: controller.signal });
      if (id !== fetchIdRef.current) return; // Stale response
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const result = adapter(json);
      setData(result.data);
      setTotal(result.total);
      setCache(cacheKey, result.data as unknown[], result.total);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (id === fetchIdRef.current) {
        toast.error("Ошибка загрузки данных");
      }
    } finally {
      if (id === fetchIdRef.current) setLoading(false);
    }
  }, [endpoint, buildParams, adapter]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [page, pageSize, debouncedSearch, sort, filters, ...dependencies]);

  // Cleanup abort on unmount
  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

  // --- Public state setters ---
  const setPage = useCallback((p: number) => setPageState(p), []);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPageState(1);
  }, []);

  const setSearch = useCallback((s: string) => {
    setSearchInput(s);
    setPageState(1);
  }, []);

  const setFilter = useCallback((key: string, value: string) => {
    setFiltersState(prev => ({ ...prev, [key]: value }));
    setPageState(1);
  }, []);

  const setFilters = useCallback((f: Record<string, string>) => {
    setFiltersState(f);
    setPageState(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState({ ...defaultFilters });
    setSearchInput("");
    setDebouncedSearch("");
    setPageState(1);
  }, [defaultFilters]);

  const setSort = useCallback((field: string, order: "asc" | "desc") => {
    setSortState({ field, order });
    setPageState(1);
  }, []);

  // --- Mutations (CSRF-protected) ---
  const mutate = useMemo(() => ({
    delete: async (id: string) => {
      const snapshot = [...data];
      setData(prev => prev.filter(r => r.id !== id));
      setTotal(prev => Math.max(0, prev - 1));
      try {
        const res = await csrfFetch(`${endpoint}/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        invalidateCache(endpoint);
      } catch {
        setData(snapshot);
        setTotal(prev => prev + 1);
        toast.error("Ошибка удаления");
      }
    },
    update: async (id: string, partial: Partial<TData>) => {
      const snapshot = [...data];
      setData(prev => prev.map(r => r.id === id ? { ...r, ...partial } : r));
      try {
        const res = await csrfFetch(`${endpoint}/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(partial),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        invalidateCache(endpoint);
      } catch {
        setData(snapshot);
        toast.error("Ошибка обновления");
      }
    },
    create: async (body: unknown): Promise<TData> => {
      const res = await csrfFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created = await res.json();
      invalidateCache(endpoint);
      await fetchData(true);
      return created as TData;
    },
    refresh: async () => {
      invalidateCache(endpoint);
      await fetchData(true);
    },
  }), [data, endpoint, fetchData]);

  // --- gridProps ---
  const gridProps = useMemo(() => ({
    data,
    loading,
    pagination: enablePagination ? {
      page,
      pageSize,
      total,
      onPageChange: setPage,
      onPageSizeChange: enablePageSizeChange ? setPageSize : undefined,
      pageSizeOptions: enablePageSizeChange ? pageSizeOptions : undefined,
    } : undefined,
    toolbar: {
      search: enableSearch ? { value: searchInput, onChange: setSearch } : undefined,
    } as import("@/components/ui/data-grid").DataGridToolbarConfig,
    sorting: sort ? [{ id: sort.field, desc: sort.order === "desc" }] : undefined,
    onSortingChange: sortable ? setSort : undefined,
  }), [data, loading, enablePagination, page, pageSize, total, setPage, enablePageSizeChange, setPageSize, pageSizeOptions, enableSearch, searchInput, setSearch, sort, sortable, setSort]);

  return {
    data, total, loading,
    page, setPage,
    pageSize, setPageSize,
    search: searchInput, setSearch,
    filters, setFilter, setFilters, resetFilters,
    sort, setSort,
    mutate,
    gridProps,
  };
}
