/**
 * Party Owner Card
 *
 * Displays current owner information for a party.
 * Shows owner assignment button for authorized users.
 */

"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User } from "lucide-react";
import type { PartyProfileOwnerDto } from "@/lib/domain/party";
import type { AssignableOwner } from "@/lib/domain/crm";
import { OwnerSelectDialog } from "./owner-select-dialog";

interface PartyOwnerCardProps {
  partyId: string;
  owner: PartyProfileOwnerDto | null;
  owners: AssignableOwner[];
  canAssignOwner: boolean;
}

export function PartyOwnerCard({
  partyId,
  owner,
  owners,
  canAssignOwner,
}: PartyOwnerCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  // Determine button state
  const isDisabled = !canAssignOwner || owners.length === 0;

  // Determine disabled reason
  let disabledReason: string | null = null;
  if (!canAssignOwner) {
    disabledReason = "Недостаточно прав для назначения владельца";
  } else if (owners.length === 0) {
    disabledReason = "Нет доступных пользователей для назначения";
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <User className="h-4 w-4" />
          Владелец
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {owner ? (
          <p className="font-medium">{owner.name}</p>
        ) : (
          <p className="text-muted-foreground text-sm">Не назначен</p>
        )}

        <div className="space-y-1">
          <Button
            variant="outline"
            size="sm"
            disabled={isDisabled}
            onClick={() => setDialogOpen(true)}
          >
            {owner ? "Сменить владельца" : "Назначить владельца"}
          </Button>

          {disabledReason && (
            <p className="text-xs text-muted-foreground">{disabledReason}</p>
          )}
        </div>

        {dialogOpen && (
          <OwnerSelectDialog
            partyId={partyId}
            owners={owners}
            open={dialogOpen}
            onOpenChange={setDialogOpen}
          />
        )}
      </CardContent>
    </Card>
  );
}
