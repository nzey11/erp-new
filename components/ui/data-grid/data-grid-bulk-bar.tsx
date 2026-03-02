"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface DataGridBulkBarProps {
  selectedCount: number;
  onClear: () => void;
  children: ReactNode;
}

export function DataGridBulkBar({ selectedCount, onClear, children }: DataGridBulkBarProps) {
  return (
    <div className="flex items-center gap-3 p-3 bg-muted/50 border rounded-lg">
      <span className="text-sm font-medium">
        Выбрано: {selectedCount}
      </span>
      <div className="flex items-center gap-2">
        {children}
      </div>
      <Button variant="ghost" size="sm" onClick={onClear} className="ml-auto">
        <X className="h-4 w-4 mr-1" />
        Снять выделение
      </Button>
    </div>
  );
}
