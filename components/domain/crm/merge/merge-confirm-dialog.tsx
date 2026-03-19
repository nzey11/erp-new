/**
 * Merge Confirm Dialog
 *
 * Confirmation dialog for party merge operation.
 */

"use client";

import { useState } from "react";
import { Modal } from "antd";
import { PartyListItemDto } from "@/lib/domain/party/dto";

interface MergeConfirmDialogProps {
  survivor: PartyListItemDto;
  victim: PartyListItemDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}

export function MergeConfirmDialog({
  survivor,
  victim,
  open,
  onOpenChange,
  onConfirm,
}: MergeConfirmDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Merge failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={() => onOpenChange(false)}
      onOk={handleConfirm}
      okButtonProps={{ danger: true, disabled: loading, loading: loading }}
      okText={loading ? "Merging..." : "Confirm Merge"}
      cancelText="Cancel"
      title="Confirm Party Merge"
    >
      <div className="space-y-4">
        <p className="text-muted-foreground">
          This action cannot be undone. All data from the victim party will be
          transferred to the survivor party.
        </p>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-green-600 font-medium">Survivor:</span>
            <span>{survivor.displayName}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-destructive font-medium">Victim:</span>
            <span>{victim.displayName}</span>
          </div>
        </div>

        <div className="p-3 bg-muted rounded-lg text-sm">
          <p className="font-medium mb-1">What will happen:</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            <li>All links from victim will be transferred to survivor</li>
            <li>All activities from victim will be transferred to survivor</li>
            <li>Victim party will be marked as &quot;merged&quot;</li>
            <li>Future lookups for victim will redirect to survivor</li>
          </ul>
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
