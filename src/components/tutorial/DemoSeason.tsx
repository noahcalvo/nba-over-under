"use client";

import { useMemo, useSyncExternalStore } from "react";
import { LeagueOverview } from "@/components/overview/LeagueOverview";
import { OverviewFallback } from "@/components/overview/OverviewFallback";
import { RostersBoard } from "@/components/rosters/RostersBoard";
import { RostersFallback } from "@/components/rosters/RostersFallback";
import { TeamDetail } from "@/components/team/TeamDetail";
import { TeamFallback } from "@/components/team/TeamFallback";
import type { GameLogRead } from "@/lib/game-log/types";
import { teamOptions } from "@/lib/team-detail";
import { seasonGameLog } from "@/lib/tutorial/season";
import { seasonStep, type SeasonLocation } from "@/lib/tutorial/season-steps";
import type { TeamId } from "@/lib/types";
import { FinishDemoDraft } from "./FinishDemoDraft";
import { SeasonControl } from "./SeasonControl";
import { SeasonTour } from "./SeasonTour";
import { useDemoSeason, type DemoSeasonSession } from "./use-demo-season";

const subscribeNever = () => () => {};

const FALLBACKS = { overview: OverviewFallback, rosters: RostersFallback, team: TeamFallback } as const;

const TITLES = { overview: "League overview", rosters: "Rosters", team: "Team page" } as const;

/** Where the chart's game history comes from, under the chart. */
const HISTORY_NOTE = "Simulated demo season: synthetic results, not real NBA games.";

/**
 * The demo league's Overview, Rosters and team pages: the real pages, fed the user's own demo draft at the current
 * checkpoint of its simulated season, with the guided season over them. Client only: the demo lives in this tab's
 * storage, which the server can't see.
 */
export function DemoSeason({ location }: { location: SeasonLocation }) {
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const Fallback = FALLBACKS[location.page];
  return mounted ? <DemoSeasonPage location={location} /> : <Fallback />;
}

function DemoSeasonPage({ location }: { location: SeasonLocation }) {
  const demo = useDemoSeason();
  if (!demo) return <FinishDemoDraft title={TITLES[location.page]} />;
  return <DemoSeasonContent key={demo.generation} demo={demo} location={location} />;
}

function DemoSeasonContent({ demo, location }: { demo: DemoSeasonSession; location: SeasonLocation }) {
  const step = seasonStep(demo.progress, location, demo.openingPick.teamId);
  return (
    <div className="flex flex-col gap-6">
      <SeasonControl checkpoint={demo.checkpoint} games={demo.games} onAdvance={demo.advance} onReplay={demo.replay} />
      {location.page === "overview" && (
        <LeagueOverview
          key={demo.checkpoint}
          league={demo.league}
          teams={demo.teams}
          viewerId={demo.viewerId}
          records={null}
          initialBasis={demo.checkpoint === "final" ? "final" : "projected"}
          highlightPick={demo.openingPick.pickNumber}
        />
      )}
      {location.page === "rosters" && <RostersBoard league={demo.league} teams={demo.teams} />}
      {location.page === "team" && <DemoTeam key={`${location.teamId}-${demo.checkpoint}`} demo={demo} teamId={location.teamId} />}
      {step && <SeasonTour step={step} demo={demo} />}
    </div>
  );
}

/** An already settled promise: `use()` reads its value at once instead of suspending. */
function settled<T>(value: T): Promise<T> {
  return Object.assign(Promise.resolve(value), { status: "fulfilled" as const, value });
}

function DemoTeam({ demo, teamId }: { demo: DemoSeasonSession; teamId: TeamId }) {
  const { league, teams, season, games, seasonYear, viewerId } = demo;
  const gameLog = useMemo(
    () => settled<GameLogRead>({ log: seasonGameLog(season, teamId, games, seasonYear), source: "Demo season", error: null }),
    [season, teamId, games, seasonYear],
  );
  const options = useMemo(() => teamOptions(teams), [teams]);
  const info = teams.find((team) => team.id === teamId);
  if (!info) return null;
  const mine = league.draft.picks.find((pick) => pick.teamId === teamId && pick.managerId === viewerId);
  return (
    <TeamDetail
      league={league}
      info={info}
      lockedLine={league.lines?.values[teamId] ?? null}
      teamOptions={options}
      gameLog={gameLog}
      market={null}
      historyNote={HISTORY_NOTE}
      highlightSide={mine?.side}
    />
  );
}
