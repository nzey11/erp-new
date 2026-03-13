/**
 * Party Profile Page
 *
 * Customer 360 view - displays party details with activity timeline.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { getPartyProfile } from "@/lib/party/queries";
import { PartyProfileHeader } from "@/components/crm/party-profile/party-profile-header";
import { PartyProfileSummary } from "@/components/crm/party-profile/party-profile-summary";
import { PartyProfileLinks } from "@/components/crm/party-profile/party-profile-links";
import { PartyActivityTimeline } from "@/components/crm/party-profile/party-activity-timeline";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface PartyProfilePageProps {
  params: Promise<{ id: string }>;
}

export default async function PartyProfilePage({ params }: PartyProfilePageProps) {
  const { id } = await params;
  const party = await getPartyProfile(id);

  if (!party) {
    notFound();
  }

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <Link href="/crm/parties">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Parties
        </Button>
      </Link>

      {/* Header */}
      <PartyProfileHeader party={party} />

      {/* Main content - Summary first layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Summary & Links */}
        <div className="space-y-6">
          <PartyProfileSummary party={party} />
          <PartyProfileLinks party={party} />
        </div>

        {/* Right column - Timeline */}
        <div className="lg:col-span-2">
          <PartyActivityTimeline party={party} />
        </div>
      </div>
    </div>
  );
}
