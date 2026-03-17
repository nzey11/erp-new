/**
 * CRM Party Profile Page
 *
 * Server page for displaying party profile.
 * Handles merged party redirect and notFound scenarios.
 * Supports owner assignment for authorized users.
 */

import { notFound, redirect } from "next/navigation";
import { getPartyProfile } from "@/lib/domain/party";
import { db } from "@/lib/shared/db";
import { getAuthSession } from "@/lib/shared/auth";
import { roleHasPermission } from "@/lib/shared/authorization";
import { listAssignableCrmOwners, type AssignableOwner } from "@/lib/domain/crm";
import { PartyProfileShell } from "./_components/party-profile-shell";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function PartyProfilePage({ params }: PageProps) {
  const { id } = await params;

  // Check if party exists and get its status
  const party = await db.party.findUnique({
    where: { id },
    select: { id: true, status: true, mergedIntoId: true },
  });

  // Not found → 404
  if (!party) {
    notFound();
  }

  // Merged → redirect to canonical URL
  if (party.status === "merged" && party.mergedIntoId) {
    redirect(`/crm/parties/${party.mergedIntoId}`);
  }

  // Active party → render profile
  const profile = await getPartyProfile(id);

  if (!profile) {
    notFound();
  }

  // Check permission for owner assignment
  const session = await getAuthSession();
  const canAssignOwner = session
    ? roleHasPermission(session.role, "crm:assignOwner")
    : false;

  // Fetch assignable owners (excluding current owner if any)
  let owners: AssignableOwner[] = [];
  if (canAssignOwner) {
    owners = await listAssignableCrmOwners({
      excludeUserId: profile.owner?.id,
    });
  }

  return (
    <PartyProfileShell
      profile={profile}
      owners={owners}
      canAssignOwner={canAssignOwner}
    />
  );
}
