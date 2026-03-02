"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EditableConfig } from "./data-grid-types";

interface DataGridCellProps {
  value: unknown;
  editable: EditableConfig;
  rowId: string;
  onClose: () => void;
}

export function DataGridCell({ value, editable, rowId, onClose }: DataGridCellProps) {
  const [localValue, setLocalValue] = useState(String(value ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSave = async () => {
    if (saving) return;

    let parsed: unknown = localValue;
    if (editable.type === "number") {
      parsed = localValue === "" ? null : Number(localValue);
      if (localValue !== "" && isNaN(parsed as number)) {
        setError("Некорректное число");
        return;
      }
    }

    if (editable.validate) {
      const result = editable.validate(parsed);
      if (typeof result === "string") {
        setError(result);
        return;
      }
      if (result === false) {
        setError("Некорректное значение");
        return;
      }
    }

    setSaving(true);
    try {
      await editable.onSave(rowId, parsed);
      onClose();
    } catch {
      setError("Ошибка сохранения");
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  if (editable.type === "select" && editable.options) {
    return (
      <Select
        value={localValue}
        onValueChange={async (val) => {
          setLocalValue(val);
          setSaving(true);
          try {
            await editable.onSave(rowId, val);
            onClose();
          } catch {
            setError("Ошибка сохранения");
            setSaving(false);
          }
        }}
        open
        onOpenChange={(open) => { if (!open) onClose(); }}
      >
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {editable.options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <Input
        ref={inputRef}
        type={editable.type === "number" ? "number" : "text"}
        value={localValue}
        onChange={(e) => { setLocalValue(e.target.value); setError(null); }}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        disabled={saving}
        className={`h-7 text-xs px-1.5 ${error ? "border-destructive ring-destructive/20" : "ring-2 ring-primary/50"}`}
      />
      {error && (
        <div className="absolute top-full left-0 mt-0.5 text-[11px] text-destructive bg-background border border-destructive/30 rounded px-1.5 py-0.5 z-50 whitespace-nowrap">
          {error}
        </div>
      )}
    </div>
  );
}
