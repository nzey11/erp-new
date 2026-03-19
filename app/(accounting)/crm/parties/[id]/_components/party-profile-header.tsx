/**
 * Party Profile Header
 *
 * Header component for party profile page.
 * Displays displayName and type badge.
 */

import { Tag } from "antd";
import type { PartyProfileDto } from "@/lib/domain/party";

interface PartyProfileHeaderProps {
  profile: PartyProfileDto;
}

export function PartyProfileHeader({ profile }: PartyProfileHeaderProps) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {profile.displayName}
        </h1>
        <div className="flex items-center gap-2 mt-1">
          <Tag color="default">
            {profile.type === "person" ? "Физ. лицо" : "Организация"}
          </Tag>
        </div>
      </div>
    </div>
  );
}
