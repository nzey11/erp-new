/**
 * Party Filters
 *
 * Client component for party list filters.
 * Maintains local draft state, applies changes via URL navigation.
 */

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Select } from "antd";
import type { PartyListParams } from "../_lib";
import { buildFilterQueryString, buildResetQueryString } from "../_lib";

interface PartyFiltersProps {
  initialParams: PartyListParams;
}

export function PartyFilters({ initialParams }: PartyFiltersProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  
  const [form, setForm] = useState({
    search: initialParams.search || "",
    type: initialParams.type || "all",
  });

  useEffect(() => {
    setMounted(true); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  // Prevent hydration mismatch from Radix UI random IDs
  if (!mounted) {
    return (
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <Input placeholder="Поиск по наименованию..." value="" disabled />
        </div>
        <div className="w-[180px]">
          <Input value="" disabled />
        </div>
        <div className="flex gap-2">
          <Button disabled>Применить</Button>
          <Button variant="outlined" disabled>Сбросить</Button>
        </div>
      </div>
    );
  }

  const handleApply = () => {
    const queryString = buildFilterQueryString(initialParams, {
      search: form.search || undefined,
      type: form.type === "all" ? undefined : (form.type as "person" | "organization"),
    });
    router.push(`/crm/parties${queryString}`);
  };

  const handleReset = () => {
    setForm({ search: "", type: "all" });
    router.push(`/crm/parties${buildResetQueryString()}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleApply();
    }
  };

  return (
    <div className="flex flex-wrap gap-4 items-end">
      <div className="flex-1 min-w-[200px]">
        <Input
          placeholder="Поиск по наименованию..."
          value={form.search}
          onChange={(e) => setForm({ ...form, search: e.target.value })}
          onKeyDown={handleKeyDown}
        />
      </div>

      <div className="w-[180px]">
        <Select
          value={form.type}
          onChange={(value) => setForm({ ...form, type: value })}
          placeholder="Все типы"
          style={{ width: "100%" }}
          options={[
            { value: "all", label: "Все типы" },
            { value: "person", label: "Физ. лицо" },
            { value: "organization", label: "Организация" },
          ]}
        />
      </div>

      <div className="flex gap-2">
        <Button type="primary" onClick={handleApply}>Применить</Button>
        <Button variant="outlined" onClick={handleReset}>
          Сбросить
        </Button>
      </div>
    </div>
  );
}
