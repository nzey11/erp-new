/**
 * Party Profile Header
 *
 * Displays party name and type badge.
 */

"use client";

import { Tag } from "antd";
import { PartyProfileDto } from "@/lib/domain/party/dto";

interface PartyProfileHeaderProps {
  party: PartyProfileDto;
}

export function PartyProfileHeader({ party }: PartyProfileHeaderProps) {
  return (
    <div className="flex items-center gap-4">
      <h1 className="text-2xl font-bold">{party.displayName}</h1>
      <Tag>
        {party.type === "person" ? "Person" : "Organization"}
      </Tag>
    </div>
  );
}
