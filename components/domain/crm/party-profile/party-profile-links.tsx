/**
 * Party Profile Links
 *
 * Displays linked entities (Customer, Counterparty).
 */

"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PartyProfileDto } from "@/lib/domain/party/dto";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PartyProfileLinksProps {
  party: PartyProfileDto;
}

export function PartyProfileLinks({ party }: PartyProfileLinksProps) {
  if (party.links.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Linked Entities</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No linked entities</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Linked Entities</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {party.links.map((link) => (
            <div
              key={`${link.type}-${link.entityId}`}
              className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
            >
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {link.type === "customer" ? "Customer" : "Counterparty"}
                </Badge>
                <span className="font-medium">{link.label}</span>
              </div>
              <Link
                href={
                  link.type === "customer"
                    ? `/store/account/orders?customer=${link.entityId}`
                    : `/counterparties/${link.entityId}`
                }
                className="text-sm text-primary hover:underline"
              >
                View →
              </Link>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
