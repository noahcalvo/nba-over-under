import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { getLeagueOrNotFound, listSeatLeagues } from "@/server/league";
import { readSeats } from "@/server/viewer";

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
  const league = getLeagueOrNotFound(leagueId);
  const otherLeagues = listSeatLeagues(await readSeats())
    .filter((seat) => seat.league.id !== league.id)
    .map(({ league: other }) => ({ id: other.id, name: other.name, seasonLabel: other.seasonLabel }));
  return (
    <AppShell league={{ id: league.id, name: league.name, seasonLabel: league.seasonLabel }} otherLeagues={otherLeagues}>
      {children}
    </AppShell>
  );
}
