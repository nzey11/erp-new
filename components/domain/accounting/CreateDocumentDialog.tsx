"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client/csrf";
import { Modal, Select } from "antd";
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
    <Modal
      open={open}
      onCancel={() => handleClose(false)}
      onOk={handleCreate}
      okButtonProps={{ disabled: creating, loading: creating }}
      okText={creating ? "Создание..." : "Создать"}
      cancelText="Отмена"
      title={title}
    >
      <div className="grid gap-4 py-4">
          {/* Document type */}
          <div className="grid gap-2">
            <Label>Тип документа *</Label>
            <Select
              value={createType}
              onChange={setCreateType}
              placeholder="Выберите тип"
              style={{ width: "100%" }}
              options={docTypes.map((t) => ({ value: t.value, label: t.label }))}
            />
          </div>

          {/* Warehouse */}
          {showWarehouse && (
            <div className="grid gap-2">
              <Label>Склад{requireWarehouse ? " *" : ""}</Label>
              <Select
                value={createWarehouseId}
                onChange={setCreateWarehouseId}
                placeholder="Выберите склад"
                style={{ width: "100%" }}
                options={warehouses.map((wh) => ({ value: wh.id, label: wh.name }))}
              />
            </div>
          )}

          {/* Target warehouse (stock_transfer) */}
          {showTarget && (
            <div className="grid gap-2">
              <Label>Склад-получатель</Label>
              <Select
                value={createTargetWarehouseId}
                onChange={setCreateTargetWarehouseId}
                placeholder="Выберите склад"
                style={{ width: "100%" }}
                options={warehouses.map((wh) => ({ value: wh.id, label: wh.name }))}
              />
            </div>
          )}

          {/* Counterparty */}
          {showCounterparty && (
            <div className="grid gap-2">
              <Label>Контрагент</Label>
              <div className="flex gap-2">
                {counterparties.length > 0 ? (
                  <Select
                    value={createCounterpartyId}
                    onChange={setCreateCounterpartyId}
                    placeholder="Выберите контрагента"
                    style={{ width: "100%", flex: 1 }}
                    options={counterparties.map((cp) => ({ value: cp.id, label: cp.name }))}
                  />
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
    </Modal>
  );
}
