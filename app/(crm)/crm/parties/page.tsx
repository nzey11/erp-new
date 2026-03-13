/**
 * Party List Page
 *
 * The first operational CRM screen.
 * Shows all parties with search and filter capabilities.
 */

import { Suspense } from "react";
import { db } from "@/lib/shared/db";
import { listParties } from "@/lib/party/queries";
import { PartyListTable } from "@/components/crm/parties/party-list-table";
import { PartyListFilters } from "@/components/crm/parties/party-list-filters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PartyListPageProps {
  searchParams: Promise<{
    search?: string;
    type?: string;
    owner?: string;
    page?: string;
  }>;
}

export default async function PartyListPage({ searchParams }: PartyListPageProps) {
  const params = await searchParams;
  const page = parseInt(params.page ?? "1", 10);

  // Build filter from query params
  const filter = {
    search: params.search,
    type: params.type as "person" | "organization" | undefined,
    ownerId: params.owner === "unassigned" ? undefined : params.owner,
  };

  // Fetch parties
  const result = await listParties(filter, page);

  // Fetch owners for filter dropdown
  const owners = await db.user.findMany({
    where: { role: { in: ["admin", "manager", "accountant"] } },
    select: { id: true, username: true },
    orderBy: { username: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Parties</h1>
        <p className="text-muted-foreground">
          {result.total} total
        </p>
      </div>

      <Card>
        <CardHeader>
          <Suspense fallback={<div className="h-10" />}>
            <PartyListFilters
              owners={owners.map((o) => ({ id: o.id, name: o.username }))}
            />
          </Suspense>
        </CardHeader>
        <CardContent>
          <PartyListTable parties={result.items} />

          {result.total > result.pageSize && (
            <div className="flex justify-center gap-2 mt-6">
              {Array.from({ length: Math.ceil(result.total / result.pageSize) }, (_, i) => (
                <a
                  key={i + 1}
                  href={`/crm/parties?page=${i + 1}`}
                  className={`px-3 py-1 rounded ${
                    i + 1 === page
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80"
                  }`}
                >
                  {i + 1}
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
