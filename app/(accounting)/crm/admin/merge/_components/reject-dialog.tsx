/**
 * Reject Dialog
 *
 * Confirmation dialog for rejecting a merge request.
 */

"use client";

import { useState } from "react";
import { Modal } from "antd";
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
    <Modal
      open={open}
      onCancel={() => onOpenChange(false)}
      onOk={handleReject}
      okButtonProps={{ disabled: isProcessing, loading: isProcessing, danger: true }}
      okText={isProcessing ? "Отклонение..." : "Отклонить"}
      cancelText="Отмена"
      title="Отклонить запрос?"
    >
      <p className="text-muted-foreground py-2">
        Запрос на слияние будет отклонён и больше не появится в списке.
      </p>
    </Modal>
  );
}
