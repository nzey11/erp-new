/**
 * Merge Admin Server Actions
 *
 * Server actions for approving and rejecting merge requests.
 */

"use server";

import { revalidatePath } from "next/cache";
import { approveMergeRequest, rejectMergeRequest } from "@/lib/party";
import { requirePermission } from "@/lib/shared/authorization";

/**
 * Approve a merge request and execute the merge.
 */
export async function approveMerge(requestId: string): Promise<void> {
  const user = await requirePermission("crm:merge");
  await approveMergeRequest(requestId, user.id);
  revalidatePath("/crm/admin/merge");
}

/**
 * Reject a merge request.
 */
export async function rejectMerge(requestId: string): Promise<void> {
  const user = await requirePermission("crm:merge");
  await rejectMergeRequest(requestId, user.id);
  revalidatePath("/crm/admin/merge");
}
