/**
 * Merge Request Card
 *
 * Card component for a single merge request.
 * Displays survivor and victim parties with approve/reject actions.
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, Button } from "antd";
import { ArrowRight, Check, X } from "lucide-react";
import type { MergeRequest } from "@/lib/domain/party";
import { approveMerge, rejectMerge } from "../_lib/actions";
import { RejectDialog } from "./reject-dialog";

interface MergeRequestCardProps {
  request: MergeRequest;
}

export function MergeRequestCard({ request }: MergeRequestCardProps) {
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleApprove = async () => {
    setIsProcessing(true);
    try {
      await approveMerge(request.id);
    } catch (error) {
      console.error("Failed to approve merge:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between py-4 px-6">
        <div className="space-y-1 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={`/crm/parties/${request.survivorId}`}
              className="font-medium hover:underline"
            >
              Партия {request.survivorId.slice(-6)}
            </Link>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <Link
              href={`/crm/parties/${request.victimId}`}
              className="font-medium hover:underline"
            >
              Партия {request.victimId.slice(-6)}
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            {request.detectionSource} • {formatDate(request.createdAt)}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            size="small"
            type="primary"
            onClick={handleApprove}
            disabled={isProcessing}
            icon={<Check className="h-4 w-4" />}
          >
            Объединить
          </Button>

          <Button
            size="small"
            variant="outlined"
            onClick={() => setIsRejectDialogOpen(true)}
            disabled={isProcessing}
            icon={<X className="h-4 w-4" />}
          >
            Отклонить
          </Button>
        </div>
      </div>

      <RejectDialog
        open={isRejectDialogOpen}
        onOpenChange={setIsRejectDialogOpen}
        requestId={request.id}
      />
    </Card>
  );
}

function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
