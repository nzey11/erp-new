/**
 * Party List Table
 *
 * Displays parties in a data grid.
 */

"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PartyListItemDto } from "@/lib/party/dto";

interface PartyListTableProps {
  parties: PartyListItemDto[];
}

export function PartyListTable({ parties }: PartyListTableProps) {
  if (parties.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No parties found
      </div>
    );
  }

  return (
    <table className="w-full">
      <thead>
        <tr className="border-b">
          <th className="text-left py-3 px-4 font-medium">Name</th>
          <th className="text-left py-3 px-4 font-medium">Type</th>
          <th className="text-left py-3 px-4 font-medium">Owner</th>
          <th className="text-left py-3 px-4 font-medium">Links</th>
          <th className="text-left py-3 px-4 font-medium">Last Activity</th>
        </tr>
      </thead>
      <tbody>
        {parties.map((party) => (
          <tr
            key={party.id}
            className="border-b hover:bg-muted/50 transition-colors"
          >
            <td className="py-3 px-4">
              <Link
                href={`/crm/parties/${party.id}`}
                className="text-primary hover:underline font-medium"
              >
                {party.displayName}
              </Link>
            </td>
            <td className="py-3 px-4">
              <Badge variant="outline">
                {party.type === "person" ? "Person" : "Organization"}
              </Badge>
            </td>
            <td className="py-3 px-4 text-muted-foreground">
              {party.ownerName ?? "—"}
            </td>
            <td className="py-3 px-4">
              <div className="flex gap-1">
                {party.links.includes("customer") && (
                  <Badge variant="secondary">Customer</Badge>
                )}
                {party.links.includes("counterparty") && (
                  <Badge variant="secondary">Counterparty</Badge>
                )}
                {party.links.length === 0 && (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            </td>
            <td className="py-3 px-4 text-muted-foreground">
              {party.lastActivityAt
                ? new Date(party.lastActivityAt).toLocaleDateString()
                : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
