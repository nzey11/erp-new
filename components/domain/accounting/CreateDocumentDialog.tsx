"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client/csrf";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { WarehouseRef, CounterpartyRef } from "@/lib/modules/accounting";

// Types that require a counterparty by default
const DEFAULT_COUNTERPARTY_TYPES = [
  "purchase_order",
  "incoming_shipment",
  "supplier_return",
  "sales_order",
  "outgoing_shipment",
  "customer_return",
  "incoming_payment",
  "outgoing_payment",
];

// Types that do NOT show a warehouse field
const NO_WAREHOUSE_TYPES = ["incoming_payment", "outgoing_payment"];

interface CreateDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  docTypes: Array<{ value: string; label: string }>;
  warehouses: WarehouseRef[];
  counterparties: CounterpartyRef[];
  onSuccess: () => void;
  /** stock: warehouse is required */
  requireWarehouse?: boolean;
  /** documents: show extra target-warehouse field for stock_transfer */
  showTargetWarehouse?: boolean;
  /** Override which doc types show the counterparty selector */
  counterpartyTypes?: string[];
  /** Called after the document is created, before dialog closes */
  onAfterCreate?: (doc: { id: string }, type: string) => Promise<void>;
  /** If provided, UserPlus button navigates to /counterparties/new?redirect=<value> */
  counterpartyRedirect?: string;
  /** Pre-select document type when dialog opens (e.g. from current tab context) */
  defaultType?: string;
}

export function CreateDocumentDialog({
  open,
  onOpenChange,
  title,
  docTypes,
  warehouses,
  counterparties,
  onSuccess,
  requireWarehouse = false,
  showTargetWarehouse = false,
  counterpartyTypes,
  onAfterCreate,
  counterpartyRedirect,
  defaultType,
}: CreateDocumentDialogProps) {
  const router = useRouter();

  const [createType, setCreateType] = useState(defaultType ?? "");
  const [createWarehouseId, setCreateWarehouseId] = useState("");
  const [createTargetWarehouseId, setCreateTargetWarehouseId] = useState("");
  const [createCounterpartyId, setCreateCounterpartyId] = useState("");
  const [creating, setCreating] = useState(false);

  // When dialog opens, reset form and pre-select defaultType
  useEffect(() => {
    if (open) {
      setCreateType(defaultType ?? "");
      setCreateWarehouseId("");
      setCreateTargetWarehouseId("");
      setCreateCounterpartyId("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const allowedCounterpartyTypes = counterpartyTypes ?? DEFAULT_COUNTERPARTY_TYPES;

  const showWarehouse =
    !!createType && !NO_WAREHOUSE_TYPES.includes(createType);

  const showTarget =
    showTargetWarehouse && createType === "stock_transfer";

  // Show counterparty section whenever the doc type requires it
  // (even if list is empty — user can still create one via UserPlus)
  const showCounterparty =
    !!createType && allowedCounterpartyTypes.includes(createType);

  const reset = () => {
    setCreateType(defaultType ?? "");
    setCreateWarehouseId("");
    setCreateTargetWarehouseId("");
    setCreateCounterpartyId("");
  };

  const handleClose = (value: boolean) => {
    if (!value) reset();
    onOpenChange(value);
  };

  const handleCreate = async () => {
    if (!createType) {
      toast.error("Выберите тип документа");
      return;
    }
    if (requireWarehouse && !createWarehouseId) {
      toast.error("Выберите склад");
      return;
    }

    setCreating(true);
    try {
      const body: Record<string, unknown> = { type: createType, items: [] };
      if (createWarehouseId) body.warehouseId = createWarehouseId;
      if (createTargetWarehouseId) body.targetWarehouseId = createTargetWarehouseId;
      if (createCounterpartyId) body.counterpartyId = createCounterpartyId;

      const res = await csrfFetch("/api/accounting/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка");
      }

      const doc = await res.json();

      if (onAfterCreate) {
        await onAfterCreate(doc, createType);
      }

      toast.success("Документ создан");
      reset();
      onOpenChange(false);
      onSuccess();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Document type */}
          <div className="grid gap-2">
            <Label>Тип документа *</Label>
            <Select value={createType} onValueChange={setCreateType}>
              <SelectTrigger data-testid="doc-type-select">
                <SelectValue placeholder="Выберите тип" />
              </SelectTrigger>
              <SelectContent>
                {docTypes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Warehouse */}
          {showWarehouse && (
            <div className="grid gap-2">
              <Label>Склад{requireWarehouse ? " *" : ""}</Label>
              <Select value={createWarehouseId} onValueChange={setCreateWarehouseId}>
                <SelectTrigger><SelectValue placeholder="Выберите склад" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((wh) => (
                    <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Target warehouse (stock_transfer) */}
          {showTarget && (
            <div className="grid gap-2">
              <Label>Склад-получатель</Label>
              <Select value={createTargetWarehouseId} onValueChange={setCreateTargetWarehouseId}>
                <SelectTrigger><SelectValue placeholder="Выберите склад" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((wh) => (
                    <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Counterparty */}
          {showCounterparty && (
            <div className="grid gap-2">
              <Label>Контрагент</Label>
              <div className="flex gap-2">
                {counterparties.length > 0 ? (
                  <Select value={createCounterpartyId} onValueChange={setCreateCounterpartyId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Выберите контрагента" />
                    </SelectTrigger>
                    <SelectContent>
                      {counterparties.map((cp) => (
                        <SelectItem key={cp.id} value={cp.id}>{cp.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex-1 flex items-center text-sm text-muted-foreground border rounded-md px-3">
                    Нет контрагентов
                  </div>
                )}
                {counterpartyRedirect && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Создать нового контрагента"
                    onClick={() => router.push(`/counterparties/new?redirect=${counterpartyRedirect}`)}
                  >
                    <UserPlus className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>Отмена</Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? "Создание..." : "Создать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
