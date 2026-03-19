/**
 * Merge Preview Card
 *
 * Shows party details before merge confirmation.
 */

"use client";

import { Tag } from "antd";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PartyListItemDto } from "@/lib/domain/party/dto";

interface MergePreviewCardProps {
  party: PartyListItemDto;
  role: "survivor" | "victim";
}

export function MergePreviewCard({ party, role }: MergePreviewCardProps) {
  const roleColor = role === "survivor" ? "text-green-600" : "text-destructive";
  const roleLabel = role === "survivor" ? "Will be kept" : "Will be merged";

  return (
    <Card className={role === "victim" ? "border-destructive/50" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{party.displayName}</CardTitle>
          <Tag>
            {party.type === "person" ? "Person" : "Organization"}
          </Tag>
        </div>
        <p className={`text-sm font-medium ${roleColor}`}>{roleLabel}</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Owner</span>
            <span>{party.ownerName ?? "Unassigned"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Last Activity</span>
            <span>
              {party.lastActivityAt
                ? new Date(party.lastActivityAt).toLocaleDateString()
                : "No activity"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Links</span>
            <div className="flex gap-1">
              {party.links.includes("customer") && (
                <Tag color="default" className="text-xs">Customer</Tag>
              )}
              {party.links.includes("counterparty") && (
                <Tag color="default" className="text-xs">Counterparty</Tag>
              )}
              {party.links.length === 0 && (
                <span className="text-muted-foreground">None</span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
