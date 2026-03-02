"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";

interface DataGridPaginationBarProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function DataGridPaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: DataGridPaginationBarProps) {
  const totalPages = Math.ceil(total / pageSize);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const [jumpValue, setJumpValue] = useState("");

  const handleJump = () => {
    const n = parseInt(jumpValue, 10);
    if (!isNaN(n) && n >= 1 && n <= totalPages) {
      onPageChange(n);
    }
    setJumpValue("");
  };

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      {/* Left: rows info + page size */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {from === 0 ? "Нет записей" : `${from}–${to} из ${total}`}
        </span>
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">Строк:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                onPageSizeChange(Number(v));
                onPageChange(1);
              }}
            >
              <SelectTrigger className="h-8 w-[72px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((opt) => (
                  <SelectItem key={opt} value={String(opt)}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Right: navigation */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1.5">
          {/* First */}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page <= 1}
            onClick={() => onPageChange(1)}
            title="Первая страница"
          >
            <ChevronFirst className="h-4 w-4" />
          </Button>
          {/* Prev */}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            title="Назад"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* Page indicator */}
          <span className="text-sm text-muted-foreground px-1 select-none">
            {page} / {totalPages}
          </span>

          {/* Next */}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            title="Далее"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {/* Last */}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page >= totalPages}
            onClick={() => onPageChange(totalPages)}
            title="Последняя страница"
          >
            <ChevronLast className="h-4 w-4" />
          </Button>

          {/* Jump to page */}
          {totalPages > 5 && (
            <div className="flex items-center gap-1 ml-2">
              <span className="text-sm text-muted-foreground">Стр.:</span>
              <Input
                type="number"
                min={1}
                max={totalPages}
                value={jumpValue}
                onChange={(e) => setJumpValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleJump()}
                onBlur={handleJump}
                className="h-8 w-16 text-sm text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="#"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
