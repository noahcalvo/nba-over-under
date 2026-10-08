import { Suspense } from "react";
import { SeatsPanel } from "@/components/access/SeatsPanel";
import { YourAccessPanel } from "@/components/access/YourAccessPanel";
import { PageHeader } from "@/components/shell/PageHeader";
import { PageFallback } from "@/components/ui/PageFallback";
import { Panel } from "@/components/ui/Panel";
import type { League } from "@/lib/types";
import { getLeagueAccess } from "@/server/access";
import { getLeagueOrNotFound } from "@/server/league";
import { getViewerId } from "@/server/session";

export default function SettingsPage({ params }: PageProps<"/l/[leagueId]/settings">) {
  return (
    <Suspense fallback={<PageFallback label="Loading settings…" />}>
      <SettingsContent params={params} />
    </Suspense>
  );
}

async function SettingsContent({ params }: { params: PageProps<"/l/[leagueId]/settings">["params"] }) {
  const { leagueId } = await params;
  const league = await getLeagueOrNotFound(leagueId);
  const viewerId = await getViewerId(league.id);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="League settings"
        subtitle={`${league.name} • ${league.seasonLabel}`}
        tag={league.isDemo ? "Demo data" : undefined}
      />
      <SettingsBody league={league} viewerId={viewerId} />
      <Panel bodyClassName="p-4 text-sm text-fog-400 sm:p-5">
        Scoring weights and round count aren&apos;t configurable yet.
      </Panel>
    </div>
  );
}

async function SettingsBody({ league, viewerId }: { league: League; viewerId: string | null }) {
  if (league.isDemo) {
    return (
      <Panel bodyClassName="p-4 text-fog-300 sm:p-5">
        The demo league is read-only. Create your own league to manage invites and seats.
      </Panel>
    );
  }
  if (viewerId === null) {
    return (
      <Panel bodyClassName="p-4 text-fog-300 sm:p-5">
        Only managers in this league can see its links. Ask your commissioner for the league invite link.
      </Panel>
    );
  }
  const access = await getLeagueAccess(league, viewerId);
  return (
    <>
      {viewerId === league.commissionerId && (
        <SeatsPanel league={league} invitePath={access.invitePath} seatInvitePaths={access.seatInvitePaths} />
      )}
      <YourAccessPanel leagueId={league.id} personalPath={access.personalPath} />
    </>
  );
}
