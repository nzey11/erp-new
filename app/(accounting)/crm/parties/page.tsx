/**
 * CRM Party List Page
 *
 * Server page for displaying party list with filters and pagination.
 * Orchestration only — delegates layout to PartyListPage shell.
 */

import { listParties } from "@/lib/party";
import { parsePartyListParams } from "./_lib";
import { PartyListPage } from "./_components/party-list-page";

interface PageProps {
  searchParams: Promise<{
    search?: string;
    type?: string;
    owner?: string;
    page?: string;
  }>;
}

export default async function PartiesPage({ searchParams }: PageProps) {
  const params = parsePartyListParams(await searchParams);

  const result = await listParties(
    {
      search: params.search,
      type: params.type,
      ownerId: params.ownerId,
    },
    params.page,
    params.pageSize
  );

  return <PartyListPage result={result} params={params} />;
}
