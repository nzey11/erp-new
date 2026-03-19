/**
 * Party Activity Timeline
 *
 * Displays recent activities for a party.
 */

"use client";

import { PartyProfileDto } from "@/lib/domain/party/dto";
import { Card } from "antd";

interface PartyActivityTimelineProps {
  party: PartyProfileDto;
}

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  order_placed: "Order Placed",
  payment_received: "Payment Received",
  manager_interaction: "Manager Interaction",
  document_created: "Document Created",
  note_added: "Note Added",
};

export function PartyActivityTimeline({ party }: PartyActivityTimelineProps) {
  if (party.activities.length === 0) {
    return (
      <Card title={<span className="text-lg">Activity Timeline</span>}>
        <p className="text-muted-foreground text-sm">No activity recorded</p>
      </Card>
    );
  }

  return (
    <Card title={<span className="text-lg">Activity Timeline</span>}>
        <div className="space-y-4">
          {party.activities.map((activity, index) => (
            <div
              key={activity.id}
              className="relative pl-6 pb-4 last:pb-0"
            >
              {/* Timeline line */}
              {index < party.activities.length - 1 && (
                <div className="absolute left-[7px] top-3 bottom-0 w-px bg-border" />
              )}

              {/* Timeline dot */}
              <div className="absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full bg-primary" />

              {/* Activity content */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">
                    {ACTIVITY_TYPE_LABELS[activity.type] ?? activity.type}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(activity.occurredAt).toLocaleDateString()}
                  </span>
                </div>
                <ActivitySummary type={activity.type} summary={activity.summary} />
              </div>
            </div>
          ))}
        </div>
    </Card>
  );
}

function ActivitySummary({ type, summary }: { type: string; summary: Record<string, unknown> }) {
  switch (type) {
    case "order_placed":
      return (
        <p className="text-sm text-muted-foreground">
          Order #{summary.orderNumber as string} — {(summary.total as number)?.toLocaleString()} ₽
        </p>
      );
    case "payment_received":
      return (
        <p className="text-sm text-muted-foreground">
          Payment {(summary.amount as number)?.toLocaleString()} ₽
        </p>
      );
    case "manager_interaction":
      return (
        <p className="text-sm text-muted-foreground">
          {(summary.notes as string) ?? "Interaction recorded"}
        </p>
      );
    default:
      return null;
  }
}
