/**
 * Merge Admin Page
 *
 * Manual party merge interface for deduplication.
 */

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PartyListItemDto } from "@/lib/party/dto";
import { MergePartyPicker } from "@/components/crm/merge/merge-party-picker";
import { MergePreviewCard } from "@/components/crm/merge/merge-preview-card";
import { MergeConfirmDialog } from "@/components/crm/merge/merge-confirm-dialog";

export default function MergeAdminPage() {
  const [survivor, setSurvivor] = useState<PartyListItemDto | null>(null);
  const [victim, setVictim] = useState<PartyListItemDto | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [success, setSuccess] = useState<{
    survivorName: string;
    victimName: string;
  } | null>(null);

  const canMerge = survivor && victim && survivor.id !== victim.id;

  const handleMerge = async () => {
    const res = await fetch("/api/crm/parties/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        survivorId: survivor!.id,
        victimId: victim!.id,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? "Merge failed");
    }

    const result = await res.json();
    setSuccess({
      survivorName: survivor!.displayName,
      victimName: victim!.displayName,
    });
    setSurvivor(null);
    setVictim(null);
  };

  const handleSwap = () => {
    const temp = survivor;
    setSurvivor(victim);
    setVictim(temp);
  };

  if (success) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Merge Parties</h1>

        <Card className="border-green-500/50 bg-green-500/5">
          <CardHeader>
            <CardTitle className="text-green-600">Merge Complete</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4">
              <strong>{success.victimName}</strong> has been merged into{" "}
              <strong>{success.survivorName}</strong>.
            </p>
            <Button onClick={() => setSuccess(null)}>
              Merge Another
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Merge Parties</h1>

      <p className="text-muted-foreground">
        Select two parties to merge. The survivor will retain all data from both parties.
      </p>

      {/* Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MergePartyPicker
          label="Survivor (will be kept)"
          selectedParty={survivor}
          onSelect={setSurvivor}
          excludeIds={victim ? [victim.id] : []}
        />
        <MergePartyPicker
          label="Victim (will be merged)"
          selectedParty={victim}
          onSelect={setVictim}
          excludeIds={survivor ? [survivor.id] : []}
        />
      </div>

      {/* Swap button */}
      {survivor && victim && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={handleSwap}>
            ⇄ Swap Survivor/Victim
          </Button>
        </div>
      )}

      {/* Preview */}
      {survivor && victim && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MergePreviewCard party={survivor} role="survivor" />
          <MergePreviewCard party={victim} role="victim" />
        </div>
      )}

      {/* Actions */}
      {survivor && victim && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setSurvivor(null);
              setVictim(null);
            }}
          >
            Clear
          </Button>
          <Button
            variant="destructive"
            disabled={!canMerge}
            onClick={() => setDialogOpen(true)}
          >
            Merge Parties
          </Button>
        </div>
      )}

      {/* Warning for same selection */}
      {survivor && victim && survivor.id === victim.id && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="pt-4">
            <p className="text-yellow-600">
              Cannot merge a party with itself. Please select different parties.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Confirm Dialog */}
      {survivor && victim && (
        <MergeConfirmDialog
          survivor={survivor}
          victim={victim}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onConfirm={handleMerge}
        />
      )}
    </div>
  );
}
