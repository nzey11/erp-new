/**
 * Merge Request Card
 *
 * Card component for a single merge request.
 * Displays survivor and victim parties with approve/reject actions.
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
      <CardContent className="flex items-center justify-between py-4">
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
            size="sm"
            onClick={handleApprove}
            disabled={isProcessing}
          >
            <Check className="h-4 w-4 mr-1" />
            Объединить
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsRejectDialogOpen(true)}
            disabled={isProcessing}
          >
            <X className="h-4 w-4 mr-1" />
            Отклонить
          </Button>
        </div>
      </CardContent>

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
