/**
 * Owner Select Dialog
 *
 * Client component for selecting a new party owner.
 */

"use client";

import { useState, useTransition, useRef } from "react";
import { Modal, Select } from "antd";
import { AlertCircle } from "lucide-react";
import type { AssignableOwner } from "@/lib/domain/crm";
import { assignPartyOwner } from "../_lib/actions";

interface OwnerSelectDialogProps {
  partyId: string;
  owners: AssignableOwner[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OwnerSelectDialog({
  partyId,
  owners,
  open,
  onOpenChange,
}: OwnerSelectDialogProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const submitRef = useRef(false);

  const handleSubmit = () => {
    // Guard: prevent double submit
    if (submitRef.current) return;
    if (!selectedUserId) return;
    if (owners.length === 0) return; // Guard: no candidates

    submitRef.current = true;
    setError(null);
    startTransition(async () => {
      const result = await assignPartyOwner(partyId, selectedUserId);

      if (result.ok) {
        onOpenChange(false);
        setSelectedUserId("");
      } else {
        setError(result.message);
      }
      submitRef.current = false;
    });
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset state on close
      setSelectedUserId("");
      setError(null);
      submitRef.current = false;
    }
    onOpenChange(newOpen);
  };

  return (
    <Modal
      open={open}
      onCancel={() => handleOpenChange(false)}
      onOk={handleSubmit}
      okButtonProps={{ disabled: isPending || !selectedUserId, loading: isPending }}
      okText={isPending ? "Назначение..." : "Назначить"}
      cancelText="Отмена"
      title="Назначение владельца"
    >
      <div className="py-4">
        <p className="text-muted-foreground mb-4">
          Выберите пользователя для назначения владельцем партии
        </p>
        <Select
          value={selectedUserId}
          onChange={setSelectedUserId}
          placeholder="Выберите пользователя"
          style={{ width: "100%" }}
          options={owners.map((owner) => ({ value: owner.id, label: owner.username }))}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}
    </Modal>
  );
}
