import { Ban } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { SidePill } from "@/components/ui/SidePill";
import { TeamLogo } from "@/components/ui/TeamLogo";
import type { EarlyEnd } from "@/lib/draft";
import { formatNumber } from "@/lib/format";
import { findManager, managerLabel } from "@/lib/league/managers";
import type { TeamLookup } from "@/lib/standings";
import type { League } from "@/lib/types";

/** Why regular drafting stopped early, what was kept and what is unclaimed. */
export function EarlyEndPanel({ league, teams, summary }: { league: League; teams: TeamLookup; summary: EarlyEnd }) {
  const blocked = findManager(league.managers, summary.blockedManagerId)!;
  const voided = summary.voidedPicks.length;
  const stats = [
    { label: "Rounds completed", value: `${summary.completedRounds} of ${summary.configuredRounds}` },
    { label: "Picks kept", value: String(league.draft.picks.length) },
    { label: "Picks voided", value: String(voided) },
    { label: "Unclaimed sides", value: String(summary.unclaimedSides.length) },
  ];
  return (
    <Panel
      title="Draft ended early"
      icon={<Ban aria-hidden className="size-5 text-negative" />}
      bodyClassName="flex flex-col gap-4 p-4 sm:p-5"
    >
      <p className="text-sm text-fog-300">
        At pick {summary.blockedPick} (round {summary.blockedRound}), {managerLabel(blocked)} had nothing left to take:
        every open side was the other side of a team they already hold, and nobody may hold both sides of a team. So
        regular drafting ended for everyone, and only the {summary.completedRounds} completed rounds count.
      </p>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-2">
            <dt className="text-xs text-fog-400">{stat.label}</dt>
            <dd className="font-display text-xl font-semibold tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-fog-300">
        {voided === 0
          ? `Round ${summary.blockedRound} hadn't started, so no picks were voided.`
          : `Round ${summary.blockedRound}'s ${voided} pick${voided === 1 ? " was" : "s were"} voided: they stay on the board marked Voided, don't score and can't be faded, and their sides are unclaimed.`}
      </p>
      <div>
        <h3 className="text-sm font-semibold">Unclaimed sides</h3>
        <ul className="mt-2 flex flex-wrap gap-2">
          {summary.unclaimedSides.map(({ teamId, side }) => {
            const team = teams[teamId];
            return (
              <li
                key={`${teamId}-${side}`}
                title={`${team.city} ${team.name} ${side}`}
                className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-sm"
              >
                <TeamLogo team={team} size={20} />
                <span>{team.id}</span>
                <SidePill side={side} size="sm" />
                <span className="font-semibold tabular-nums">{formatNumber(team.line)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </Panel>
  );
}
