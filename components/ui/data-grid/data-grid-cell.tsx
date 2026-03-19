"use client";

import { useState, useRef, useEffect } from "react";
import { Select, Input } from "antd";
import type { InputRef } from "antd/es/input";
import type { EditableConfig } from "./data-grid-types";

interface DataGridCellProps {
  value: unknown;
  editable: EditableConfig;
  rowId: string;
  onClose: () => void;
}

export function DataGridCell({ value, editable, rowId, onClose }: DataGridCellProps) {
  // For date fields, normalise to YYYY-MM-DD string expected by <input type="date">
  const initialValue = editable.type === "date"
    ? (() => {
        if (!value) return "";
        const d = value instanceof Date ? value : new Date(String(value));
        return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
      })()
    : String(value ?? "");

  const [localValue, setLocalValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<InputRef>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select?.();
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
    } else if (editable.type === "date") {
      // Keep as ISO date string or null
      parsed = localValue === "" ? null : localValue;
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
        onChange={async (val: string) => {
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
        onDropdownVisibleChange={(open) => { if (!open) onClose(); }}
        className="h-7 text-xs"
        style={{ width: "100%" }}
        options={editable.options.map((opt) => ({ value: opt.value, label: opt.label }))}
      />
    );
  }

  if (editable.type === "date") {
    return (
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <Input
          ref={inputRef}
          type="date"
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
