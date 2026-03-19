/**
 * Party List Filters
 *
 * Search and filter controls for Party List.
 */

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Select, Input, Button } from "antd";

interface PartyListFiltersProps {
  owners: Array<{ id: string; name: string }>;
}

export function PartyListFilters({ owners }: PartyListFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");

  const currentType = searchParams.get("type") ?? "all";
  const currentOwner = searchParams.get("owner") ?? "all";

  const applyFilters = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value && value !== "all") {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/crm/parties?${params.toString()}`);
  };

  const handleSearch = () => {
    applyFilters("search", search);
  };

  const clearFilters = () => {
    setSearch("");
    router.push("/crm/parties");
  };

  return (
    <div className="flex flex-wrap gap-4 items-end">
      <div className="flex gap-2 flex-1 min-w-[250px]">
        <Input
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <Button type="primary" onClick={handleSearch}>Search</Button>
      </div>

      <Select
        value={currentType}
        onChange={(v) => applyFilters("type", v)}
        placeholder="All types"
        style={{ width: 150 }}
        options={[
          { value: "all", label: "All types" },
          { value: "person", label: "Person" },
          { value: "organization", label: "Organization" },
        ]}
      />

      <Select
        value={currentOwner}
        onChange={(v) => applyFilters("owner", v)}
        placeholder="All owners"
        style={{ width: 180 }}
        options={[
          { value: "all", label: "All owners" },
          { value: "unassigned", label: "Unassigned" },
          ...owners.map((owner) => ({ value: owner.id, label: owner.name })),
        ]}
      />

      {(search || currentType || currentOwner) && (
        <Button variant="outlined" onClick={clearFilters}>
          Clear
        </Button>
      )}
    </div>
  );
}
