/**
 * Party List Filters
 *
 * Search and filter controls for Party List.
 */

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

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
        <Button onClick={handleSearch}>Search</Button>
      </div>

      <Select value={currentType} onValueChange={(v) => applyFilters("type", v)}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="All types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          <SelectItem value="person">Person</SelectItem>
          <SelectItem value="organization">Organization</SelectItem>
        </SelectContent>
      </Select>

      <Select value={currentOwner} onValueChange={(v) => applyFilters("owner", v)}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="All owners" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All owners</SelectItem>
          <SelectItem value="unassigned">Unassigned</SelectItem>
          {owners.map((owner) => (
            <SelectItem key={owner.id} value={owner.id}>
              {owner.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {(search || currentType || currentOwner) && (
        <Button variant="outline" onClick={clearFilters}>
          Clear
        </Button>
      )}
    </div>
  );
}
