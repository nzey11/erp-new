/**
 * Party Profile Links
 *
 * Displays linked entities (Customer, Counterparty).
 */

"use client";

import Link from "next/link";
import { Tag } from "antd";
import { PartyProfileDto } from "@/lib/domain/party/dto";
import { Card } from "antd";

interface PartyProfileLinksProps {
  party: PartyProfileDto;
}

export function PartyProfileLinks({ party }: PartyProfileLinksProps) {
  if (party.links.length === 0) {
    return (
      <Card title={<span className="text-lg">Linked Entities</span>}>
        <p className="text-muted-foreground text-sm">No linked entities</p>
      </Card>
    );
  }

  return (
    <Card title={<span className="text-lg">Linked Entities</span>}>
        <div className="space-y-2">
          {party.links.map((link) => (
            <div
              key={`${link.type}-${link.entityId}`}
              className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
            >
              <div className="flex items-center gap-2">
                <Tag color="default">
                  {link.type === "customer" ? "Customer" : "Counterparty"}
                </Tag>
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
    </Card>
  );
}
