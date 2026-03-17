/**
 * Party List Page Shell
 *
 * Layout shell for party list page.
 * Handles empty state branching and composes all page sections.
 */

import { PageHeader } from "@/components/shared/page-header";
import type { PartyListResult } from "@/lib/domain/party";
import type { PartyListParams } from "../_lib";
import { PartyFilters } from "./party-filters";
import { PartyTable } from "./party-table";
import { PartyPager } from "./party-pager";
import { PartyEmptyState } from "./party-empty-state";

interface PartyListPageProps {
  result: PartyListResult;
  params: PartyListParams;
}

export function PartyListPage({ result, params }: PartyListPageProps) {
  const hasFilters = Boolean(params.search || params.type || params.ownerId);
  const isEmpty = result.items.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Партии"
        description="Единый профиль контрагента и покупателя"
      />

      <PartyFilters initialParams={params} />

      {isEmpty ? (
        <PartyEmptyState hasFilters={hasFilters} />
      ) : (
        <>
          <PartyTable items={result.items} />
          <PartyPager
            total={result.total}
            page={result.page}
            pageSize={result.pageSize}
            params={params}
          />
        </>
      )}
    </div>
  );
}
