/**
 * Party Profile Shell
 *
 * Two-column layout shell for party profile page.
 * Left column: owner, links, notes cards
 * Right column: activity timeline
 */

import { PartyProfileHeader } from "./party-profile-header";
import { PartyOwnerCard } from "./party-owner-card";
import { PartyLinksCard } from "./party-links-card";
import { PartyNotesCard } from "./party-notes-card";
import { PartyActivityTimeline } from "./party-activity-timeline";
import type { PartyProfileDto } from "@/lib/party";
import type { AssignableOwner } from "@/lib/crm";

interface PartyProfileShellProps {
  profile: PartyProfileDto;
  owners: AssignableOwner[];
  canAssignOwner: boolean;
}

export function PartyProfileShell({
  profile,
  owners,
  canAssignOwner,
}: PartyProfileShellProps) {
  return (
    <div className="space-y-6">
      <PartyProfileHeader profile={profile} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - 1/3 width */}
        <div className="space-y-4">
          <PartyOwnerCard
            partyId={profile.id}
            owner={profile.owner}
            owners={owners}
            canAssignOwner={canAssignOwner}
          />
          <PartyLinksCard links={profile.links} />
          {profile.notes && <PartyNotesCard notes={profile.notes} />}
        </div>

        {/* Right column - 2/3 width */}
        <div className="lg:col-span-2">
          <PartyActivityTimeline activities={profile.activities} />
        </div>
      </div>
    </div>
  );
}
