/**
 * Party Profile Header
 *
 * Displays party name and type badge.
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { PartyProfileDto } from "@/lib/party/dto";

interface PartyProfileHeaderProps {
  party: PartyProfileDto;
}

export function PartyProfileHeader({ party }: PartyProfileHeaderProps) {
  return (
    <div className="flex items-center gap-4">
      <h1 className="text-2xl font-bold">{party.displayName}</h1>
      <Badge variant="outline">
        {party.type === "person" ? "Person" : "Organization"}
      </Badge>
    </div>
  );
}
