"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "antd";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/shared/utils";

interface CSVImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

interface CSVRow {
  [key: string]: string;
}

interface ColumnMapping {
  csvColumn: string;
  productField: string;
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
}

const PRODUCT_FIELDS = [
  { key: "", label: "— Пропустить —" },
  { key: "name", label: "Название *", required: true },
  { key: "sku", label: "Артикул" },
  { key: "barcode", label: "Штрихкод" },
  { key: "unitName", label: "Единица измерения" },
  { key: "categoryName", label: "Категория" },
  { key: "purchasePrice", label: "Цена закупки" },
  { key: "salePrice", label: "Цена продажи" },
  { key: "description", label: "Описание" },
];

type Step = "upload" | "mapping" | "preview" | "result";

function parseCSV(text: string): { headers: string[]; rows: CSVRow[] } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  // Simple CSV parser (handles quoted fields)
  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const row: CSVRow = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || "";
    });
    rows.push(row);
  }

  return { headers, rows };
}

function autoDetectMapping(headers: string[]): ColumnMapping[] {
  const mappings: ColumnMapping[] = [];

  const fieldPatterns: Record<string, string[]> = {
    name: ["название", "name", "наименование", "товар", "product"],
    sku: ["артикул", "sku", "код", "code", "арт"],
    barcode: ["штрихкод", "barcode", "ean", "штрих"],
    unitName: ["единица", "unit", "ед", "ед.изм", "ед. изм"],
    categoryName: ["категория", "category", "группа", "group"],
    purchasePrice: ["закупка", "purchase", "себестоимость", "cost", "цена закупки"],
    salePrice: ["продажа", "sale", "цена", "price", "розница", "цена продажи"],
    description: ["описание", "description", "desc"],
  };

  headers.forEach((header) => {
    const lowerHeader = header.toLowerCase();
    let matchedField = "";

    for (const [field, patterns] of Object.entries(fieldPatterns)) {
      if (patterns.some((p) => lowerHeader.includes(p))) {
        matchedField = field;
        break;
      }
    }

    mappings.push({ csvColumn: header, productField: matchedField });
  });

  return mappings;
}

export function CSVImportWizard({ open, onOpenChange, onImported }: CSVImportWizardProps) {
  const [step, setStep] = useState<Step>("upload");
  const [, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<CSVRow[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetWizard = () => {
    setStep("upload");
    setCsvHeaders([]);
    setCsvRows([]);
    setMappings([]);
    setUpdateExisting(false);
    setResult(null);
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(resetWizard, 300);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const { headers, rows } = parseCSV(text);

      if (headers.length === 0) {
        toast.error("Файл пустой или имеет неверный формат");
        return;
      }

      setCsvHeaders(headers);
      setCsvRows(rows);
      setMappings(autoDetectMapping(headers));
      setStep("mapping");
    } catch {
      toast.error("Ошибка чтения файла");
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const updateMapping = (csvColumn: string, productField: string) => {
    setMappings((prev) =>
      prev.map((m) => (m.csvColumn === csvColumn ? { ...m, productField } : m))
    );
  };

  const hasNameMapping = mappings.some((m) => m.productField === "name");

  const getPreviewData = () => {
    return csvRows.slice(0, 10).map((row) => {
      const product: Record<string, string> = {};
      mappings.forEach((m) => {
        if (m.productField) {
          product[m.productField] = row[m.csvColumn] || "";
        }
      });
      return product;
    });
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const products = csvRows.map((row) => {
        const product: Record<string, string | number | undefined> = {};
        mappings.forEach((m) => {
          if (m.productField && row[m.csvColumn]) {
            const value = row[m.csvColumn];
            if (m.productField === "purchasePrice" || m.productField === "salePrice") {
              const num = parseFloat(value.replace(/[^\d.,]/g, "").replace(",", "."));
              if (!isNaN(num)) product[m.productField] = num;
            } else {
              product[m.productField] = value;
            }
          }
        });
        return product;
      }).filter((p) => p.name); // Only products with name

      const res = await fetch("/api/accounting/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products, updateExisting }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка импорта");
      }

      const importResult: ImportResult = await res.json();
      setResult(importResult);
      setStep("result");

      if (importResult.created > 0 || importResult.updated > 0) {
        onImported();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка импорта");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Импорт товаров из CSV
            {step !== "upload" && (
              <span className="text-muted-foreground font-normal ml-2">
                — {step === "mapping" && "Сопоставление колонок"}
                {step === "preview" && "Предпросмотр"}
                {step === "result" && "Результат"}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div className="py-8">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium mb-2">Загрузите CSV файл</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Поддерживается формат CSV с заголовками в первой строке
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Выбрать файл
              </Button>
            </div>
            <div className="mt-4 text-sm text-muted-foreground">
              <p className="font-medium mb-1">Рекомендации:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Обязательное поле: Название товара</li>
                <li>Кодировка файла: UTF-8</li>
                <li>Разделитель: запятая (,)</li>
              </ul>
            </div>
          </div>
        )}

        {/* Step 2: Mapping */}
        {step === "mapping" && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Сопоставьте колонки CSV с полями товара. Обнаружено {csvRows.length} строк.
            </p>

            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Колонка в файле</TableHead>
                    <TableHead>Пример значения</TableHead>
                    <TableHead>Поле товара</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mappings.map((mapping) => (
                    <TableRow key={mapping.csvColumn}>
                      <TableCell className="font-medium">{mapping.csvColumn}</TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate">
                        {csvRows[0]?.[mapping.csvColumn] || "—"}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={mapping.productField}
                          onValueChange={(v) => updateMapping(mapping.csvColumn, v)}
                        >
                          <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Выберите поле" />
                          </SelectTrigger>
                          <SelectContent>
                            {PRODUCT_FIELDS.map((f) => (
                              <SelectItem key={f.key} value={f.key}>
                                {f.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Checkbox
              checked={updateExisting}
              onChange={(e) => setUpdateExisting(e.target.checked)}
            >
              Обновлять существующие товары (по артикулу)
            </Checkbox>

            {!hasNameMapping && (
              <div className="flex items-center gap-2 text-amber-600 text-sm">
                <AlertCircle className="h-4 w-4" />
                Сопоставьте поле &quot;Название&quot; — оно обязательно
              </div>
            )}
          </div>
        )}

        {/* Step 3: Preview */}
        {step === "preview" && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Предпросмотр первых 10 товаров (всего: {csvRows.length})
            </p>

            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Название</TableHead>
                    <TableHead>Артикул</TableHead>
                    <TableHead>Категория</TableHead>
                    <TableHead className="text-right">Цена продажи</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {getPreviewData().map((product, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-medium">{product.name || "—"}</TableCell>
                      <TableCell>{product.sku || "—"}</TableCell>
                      <TableCell>{product.categoryName || "—"}</TableCell>
                      <TableCell className="text-right">{product.salePrice || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {updateExisting && (
              <div className="flex items-center gap-2 text-blue-600 text-sm">
                <AlertCircle className="h-4 w-4" />
                Товары с существующим артикулом будут обновлены
              </div>
            )}
          </div>
        )}

        {/* Step 4: Result */}
        {step === "result" && result && (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="border rounded-lg p-4 text-center">
                <CheckCircle2 className="h-8 w-8 mx-auto text-green-600 mb-2" />
                <div className="text-2xl font-bold">{result.created}</div>
                <div className="text-sm text-muted-foreground">Создано</div>
              </div>
              <div className="border rounded-lg p-4 text-center">
                <CheckCircle2 className="h-8 w-8 mx-auto text-blue-600 mb-2" />
                <div className="text-2xl font-bold">{result.updated}</div>
                <div className="text-sm text-muted-foreground">Обновлено</div>
              </div>
              <div className="border rounded-lg p-4 text-center">
                <XCircle className={cn("h-8 w-8 mx-auto mb-2", result.skipped > 0 ? "text-amber-600" : "text-muted-foreground")} />
                <div className="text-2xl font-bold">{result.skipped}</div>
                <div className="text-sm text-muted-foreground">Пропущено</div>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="border rounded-lg p-4 bg-destructive/10">
                <h4 className="font-medium text-destructive mb-2">
                  Ошибки ({result.errors.length})
                </h4>
                <ul className="text-sm space-y-1 max-h-32 overflow-y-auto">
                  {result.errors.slice(0, 10).map((err, idx) => (
                    <li key={idx}>
                      Строка {err.row}: {err.error}
                    </li>
                  ))}
                  {result.errors.length > 10 && (
                    <li className="text-muted-foreground">
                      ...и ещё {result.errors.length - 10} ошибок
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "upload" && (
            <Button variant="outline" onClick={handleClose}>
              Отмена
            </Button>
          )}

          {step === "mapping" && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")}>
                Назад
              </Button>
              <Button onClick={() => setStep("preview")} disabled={!hasNameMapping}>
                Далее
              </Button>
            </>
          )}

          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("mapping")}>
                Назад
              </Button>
              <Button onClick={handleImport} disabled={importing}>
                {importing ? "Импорт..." : `Импортировать ${csvRows.length} товаров`}
              </Button>
            </>
          )}

          {step === "result" && (
            <Button onClick={handleClose}>Закрыть</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
