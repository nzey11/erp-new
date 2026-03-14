/**
 * Reject Dialog
 *
 * Confirmation dialog for rejecting a merge request.
 */

"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { rejectMerge } from "../_lib/actions";

interface RejectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string;
}

export function RejectDialog({ open, onOpenChange, requestId }: RejectDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleReject = async () => {
    setIsProcessing(true);
    try {
      await rejectMerge(requestId);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to reject merge:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Отклонить запрос?</DialogTitle>
          <DialogDescription>
            Запрос на слияние будет отклонён и больше не появится в списке.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
          >
            Отмена
          </Button>
          <Button
            variant="destructive"
            onClick={handleReject}
            disabled={isProcessing}
          >
            Отклонить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
