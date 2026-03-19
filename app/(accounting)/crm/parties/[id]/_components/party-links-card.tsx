/**
 * Party Links Card
 *
 * Displays entity links for a party (customer, counterparty).
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tag } from "antd";
import { Link2 } from "lucide-react";
import type { PartyProfileLinkDto } from "@/lib/domain/party";

interface PartyLinksCardProps {
  links: PartyProfileLinkDto[];
}

export function PartyLinksCard({ links }: PartyLinksCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Связи
        </CardTitle>
      </CardHeader>
      <CardContent>
        {links.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {links.map((link, index) => (
              <Tag color="default" key={index}>
                {getLinkLabel(link.type)}
              </Tag>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Нет связей</p>
        )}
      </CardContent>
    </Card>
  );
}

function getLinkLabel(entityType: string): string {
  const labels: Record<string, string> = {
    customer: "Покупатель",
    counterparty: "Контрагент",
  };
  return labels[entityType] || entityType;
}
