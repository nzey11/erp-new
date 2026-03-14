/**
 * CRM Merge Admin Page
 *
 * Server page for managing pending merge requests.
 */

import { getPendingMergeRequests } from "@/lib/party";
import { MergeAdminPage } from "./_components/merge-admin-page";

export default async function MergeAdminPageContainer() {
  const requests = await getPendingMergeRequests();

  return <MergeAdminPage requests={requests} />;
}
