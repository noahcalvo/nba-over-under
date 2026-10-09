import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { getLeagueOrNotFound, listViewerLeagues } from "@/server/league";

export default function LeagueLayout({ params, children }: LayoutProps<"/l/[leagueId]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-ink-950" aria-busy="true" />}>
      <LeagueShell params={params}>{children}</LeagueShell>
    </Suspense>
  );
}

async function LeagueShell({
  params,
  children,
}: {
  params: LayoutProps<"/l/[leagueId]">["params"];
  children: ReactNode;
}) {
  const { leagueId } = await params;
  const league = await getLeagueOrNotFound(leagueId);
  const otherLeagues = (await listViewerLeagues())
    .filter((other) => other.id !== league.id)
    .map((other) => ({ id: other.id, name: other.name, seasonLabel: other.seasonLabel }));
  return (
    <AppShell
      league={{ id: league.id, name: league.name, seasonLabel: league.seasonLabel, isDemo: league.isDemo }}
      otherLeagues={otherLeagues}
    >
      {children}
    </AppShell>
  );
}
