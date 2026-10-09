import { Suspense } from "react";
import { ScoringRulesPanel } from "@/components/settings/ScoringRulesPanel";
import { SeatsPanel } from "@/components/access/SeatsPanel";
import { YourAccessPanel } from "@/components/access/YourAccessPanel";
import { PageHeader } from "@/components/shell/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { getLeagueAccess } from "@/server/access";
import { getLeagueOrNotFound } from "@/server/league";
import { getViewerId } from "@/server/session";

type Params = PageProps<"/l/[leagueId]/settings">["params"];

/** A revisit within this many seconds reuses the last render instead of waiting for the server (see CLAUDE.md). */
export const unstable_dynamicStaleTime = 60;

// The title and the scoring rules need no data, so they are part of the prerendered shell and show the moment a
// navigation starts. Only the league's name and the viewer's links wait for the database.
export default function SettingsPage({ params }: PageProps<"/l/[leagueId]/settings">) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="League settings"
        subtitle={
          <Suspense fallback={<SubtitlePlaceholder />}>
            <LeagueSubtitle params={params} />
          </Suspense>
        }
        actions={
          <Suspense fallback={null}>
            <DemoTag params={params} />
          </Suspense>
        }
      />
      <ScoringRulesPanel />
      <Suspense fallback={<div aria-busy className="h-40 animate-pulse rounded-xl border border-ink-700 bg-ink-850/90" />}>
        <SettingsBody params={params} />
      </Suspense>
    </div>
  );
}

function SubtitlePlaceholder() {
  return <span className="inline-block h-[1em] w-56 animate-pulse rounded bg-ink-800 align-middle" />;
}

async function LeagueSubtitle({ params }: { params: Params }) {
  const league = await getLeagueOrNotFound((await params).leagueId);
  return `${league.name} • ${league.seasonLabel}`;
}

async function DemoTag({ params }: { params: Params }) {
  const league = await getLeagueOrNotFound((await params).leagueId);
  if (!league.isDemo) return null;
  return <span className="pt-2 text-xs font-semibold uppercase tracking-[0.2em] text-link">Demo data</span>;
}

async function SettingsBody({ params }: { params: Params }) {
  const league = await getLeagueOrNotFound((await params).leagueId);
  if (league.isDemo) {
    return (
      <Panel bodyClassName="p-4 text-fog-300 sm:p-5">
        The demo league is read-only. Create your own league to manage invites and seats.
      </Panel>
    );
  }
  const viewerId = await getViewerId(league.id);
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
