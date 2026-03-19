/**
 * Merge Party Picker
 *
 * Search and select a party for merge operations.
 */

"use client";

import { useState, useEffect } from "react";
import { Tag, Input } from "antd";
import { PartyListItemDto } from "@/lib/domain/party/dto";

interface MergePartyPickerProps {
  label: string;
  selectedParty: PartyListItemDto | null;
  onSelect: (party: PartyListItemDto | null) => void;
  excludeIds?: string[];
}

export function MergePartyPicker({
  label,
  selectedParty,
  onSelect,
  excludeIds = [],
}: MergePartyPickerProps) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PartyListItemDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (search.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/crm/parties/search?q=${encodeURIComponent(search)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.parties.filter((p: PartyListItemDto) => !excludeIds.includes(p.id)));
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search, excludeIds]);

  const handleSelect = (party: PartyListItemDto) => {
    onSelect(party);
    setSearch("");
    setShowResults(false);
  };

  const handleClear = () => {
    onSelect(null);
    setSearch("");
  };

  if (selectedParty) {
    return (
      <div className="p-4 border rounded-lg bg-muted/30">
        <p className="text-sm text-muted-foreground mb-2">{label}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium">{selectedParty.displayName}</span>
            <Tag>
              {selectedParty.type === "person" ? "Person" : "Organization"}
            </Tag>
          </div>
          <button
            onClick={handleClear}
            className="text-sm text-muted-foreground hover:text-destructive"
          >
            Clear
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 border rounded-lg">
      <p className="text-sm text-muted-foreground mb-2">{label}</p>
      <div className="relative">
        <Input
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setShowResults(true)}
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <span className="text-xs text-muted-foreground">Searching...</span>
          </div>
        )}
        {showResults && results.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-60 overflow-auto">
            {results.map((party) => (
              <button
                key={party.id}
                className="w-full px-3 py-2 text-left hover:bg-muted flex items-center justify-between"
                onClick={() => handleSelect(party)}
              >
                <span className="font-medium">{party.displayName}</span>
                <div className="flex items-center gap-2">
                  <Tag className="text-xs">
                    {party.type === "person" ? "Person" : "Org"}
                  </Tag>
                  {party.ownerName && (
                    <span className="text-xs text-muted-foreground">
                      {party.ownerName}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
        {showResults && search.length >= 2 && !loading && results.length === 0 && (
          <div className="absolute z-10 w-full mt-1 bg-background border rounded-lg shadow-lg p-3">
            <p className="text-sm text-muted-foreground">No parties found</p>
          </div>
        )}
      </div>
    </div>
  );
}
