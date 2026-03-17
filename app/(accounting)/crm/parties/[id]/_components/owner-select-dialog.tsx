/**
 * Owner Select Dialog
 *
 * Client component for selecting a new party owner.
 */

"use client";

import { useState, useTransition, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Назначение владельца</DialogTitle>
          <DialogDescription>
            Выберите пользователя для назначения владельцем партии
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите пользователя" />
            </SelectTrigger>
            <SelectContent>
              {owners.map((owner) => (
                <SelectItem key={owner.id} value={owner.id}>
                  {owner.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            Отмена
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !selectedUserId}
          >
            {isPending ? "Назначение..." : "Назначить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
