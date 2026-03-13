/**
 * Party Profile Summary
 *
 * Displays key party information: owner, dates, notes.
 */

"use client";

import { PartyProfileDto } from "@/lib/party/dto";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PartyProfileSummaryProps {
  party: PartyProfileDto;
}

export function PartyProfileSummary({ party }: PartyProfileSummaryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Owner</p>
            <p className="font-medium">{party.owner?.name ?? "Unassigned"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Last Activity</p>
            <p className="font-medium">
              {party.lastActivityAt
                ? new Date(party.lastActivityAt).toLocaleDateString()
                : "No activity"}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Created</p>
            <p className="font-medium">
              {new Date(party.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">ID</p>
            <p className="font-mono text-sm text-muted-foreground">
              {party.id.slice(0, 8)}...
            </p>
          </div>
        </div>

        {party.notes && (
          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground mb-1">Notes</p>
            <p className="text-sm">{party.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
