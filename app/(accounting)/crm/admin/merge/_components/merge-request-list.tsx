/**
 * Merge Request List
 *
 * List container for pending merge requests.
 */

import { MergeRequestCard } from "./merge-request-card";
import type { MergeRequest } from "@/lib/party";

interface MergeRequestListProps {
  requests: MergeRequest[];
}

export function MergeRequestList({ requests }: MergeRequestListProps) {
  return (
    <div className="space-y-4">
      {requests.map((request) => (
        <MergeRequestCard key={request.id} request={request} />
      ))}
    </div>
  );
}
