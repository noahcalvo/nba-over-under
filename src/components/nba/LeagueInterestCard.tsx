import Link from "next/link";
import { Trophy } from "lucide-react";
import { TeamChip } from "@/components/nba/TeamChip";
import { Badge } from "@/components/ui/Badge";
import { ManagerAvatar } from "@/components/ui/ManagerAvatar";
import { SidePill } from "@/components/ui/SidePill";
import { formatNumber } from "@/lib/format";
import { managerLabel } from "@/lib/league/managers";
import type { InterestRow, LeagueInterest } from "@/lib/nba-schedule/interest";
import type { TeamInfo } from "@/lib/types";

function Row({ row, leagueId, teams }: { row: InterestRow; leagueId: string; teams: TeamInfo[] }) {
  const team = teams.find((t) => t.id === row.teamId);
  const rooting = teams.find((t) => t.id === row.rootingFor);
  const href = `/l/${leagueId}/teams/${row.teamId}`;
  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-l-2 px-3 py-3 sm:px-4 ${row.isViewer ? "border-accent bg-accent/5" : "border-transparent"}`}>
      <ManagerAvatar manager={row.manager} size="md" />
      <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 text-fog-50">
          <span className="font-semibold">{managerLabel(row.manager)}</span>
          {row.isViewer && <Badge tone="accent">You</Badge>}
          {row.kind === "fade" && <Badge tone="neutral">Fade</Badge>}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fog-300">
          {row.kind === "fade" && row.targetManager && <span>{`Fading ${managerLabel(row.targetManager)}'s`}</span>}
          <TeamChip team={team} id={row.teamId} href={href} />
          <SidePill side={row.side} size="sm" />
          <span className="tabular-nums">{formatNumber(row.line)}</span>
        </p>
      </div>
      <p className="text-sm text-fog-300">Rooting for {rooting?.name ?? row.rootingFor}</p>
    </li>
  );
}

function Body({ interest, teams }: { interest: LeagueInterest; teams: TeamInfo[] }) {
  if (interest.state === "not_started") return <p className="px-4 py-4 text-sm text-fog-300">{"The draft hasn't started."}</p>;
  if (interest.state === "none") {
    return <p className="px-4 py-4 text-sm text-fog-300">{"No one in this league has drafted either team's Over or Under."}</p>;
  }
  return (
    <ul className="divide-y divide-ink-700/60">
      {interest.rows.map((row, i) => (
        <Row key={`${row.kind}:${row.manager.id}:${row.teamId}:${row.side}:${i}`} row={row} leagueId={interest.leagueId} teams={teams} />
      ))}
    </ul>
  );
}

/** One league: every pick and fade on either team. The league name links to the league. */
export function LeagueInterestCard({ interest, teams }: { interest: LeagueInterest; teams: TeamInfo[] }) {
  const managers = new Set(interest.rows.map((row) => row.manager.id)).size;
  return (
    <section className="overflow-hidden rounded-lg border border-ink-700 bg-ink-900/60">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-ink-700 px-4 py-3">
        <h3 className="flex min-w-0 items-center gap-2 font-semibold text-fog-50">
          <Trophy aria-hidden className="size-4 shrink-0 text-accent" />
          <Link href={`/l/${interest.leagueId}`} className="truncate hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            {interest.leagueName}
          </Link>
        </h3>
        {managers > 0 && <p className="text-sm text-fog-400">{managers === 1 ? "1 manager" : `${managers} managers`} on this game</p>}
      </header>
      <Body interest={interest} teams={teams} />
    </section>
  );
}
