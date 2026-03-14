/**
 * Merge Admin Page Shell
 *
 * Layout shell for merge admin page.
 */

import { PageHeader } from "@/components/page-header";
import { MergeRequestList } from "./merge-request-list";
import { MergeEmptyState } from "./merge-empty-state";
import type { MergeRequest } from "@/lib/party";

interface MergeAdminPageProps {
  requests: MergeRequest[];
}

export function MergeAdminPage({ requests }: MergeAdminPageProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Запросы на слияние"
        description={
          requests.length > 0
            ? `${requests.length} запросов ожидает обработки`
            : "Управление дубликатами партий"
        }
      />

      {requests.length === 0 ? (
        <MergeEmptyState />
      ) : (
        <MergeRequestList requests={requests} />
      )}
    </div>
  );
}
