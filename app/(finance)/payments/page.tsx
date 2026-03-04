"use client";

import { useRef, useState, Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { DocumentsTable, DOC_TYPE_OPTIONS } from "@/components/accounting";
import type { DocumentsTableHandle } from "@/components/accounting/DocumentsTable";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const FINANCE_TYPES = DOC_TYPE_OPTIONS.filter((t) => t.group === "finance");

// Loading fallback for Suspense
function DocumentsTableFallback() {
  return <div className="py-8 text-center text-muted-foreground">Загрузка...</div>;
}

export default function PaymentsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState("");
  const [creating, setCreating] = useState(false);
  const tableRef = useRef<DocumentsTableHandle>(null);

  const handleCreate = async () => {
    if (!createType) {
      toast.error("Выберите тип документа");
      return;
    }
    setCreating(true);
    try {
      const body: Record<string, unknown> = { type: createType, items: [] };

      const res = await fetch("/api/accounting/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка");
      }

      toast.success("Документ создан");
      setCreateOpen(false);
      setCreateType("");
      tableRef.current?.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Платежи"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Новый платёж
          </Button>
        }
      />

      <Suspense fallback={<DocumentsTableFallback />}>
        <DocumentsTable
          ref={tableRef}
          groupFilter="finance"
          defaultTypeFilter=""
        />
      </Suspense>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Новый платёж</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Тип документа *</Label>
              <Select value={createType} onValueChange={setCreateType}>
                <SelectTrigger><SelectValue placeholder="Выберите тип" /></SelectTrigger>
                <SelectContent>
                  {FINANCE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Отмена</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Создание..." : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
