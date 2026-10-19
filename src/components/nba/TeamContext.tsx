import Link from "next/link";
import { Suspense } from "react";
import { FormChips } from "@/components/nba/FormChips";
import { HeatBadge } from "@/components/nba/HeatBadge";
import { Panel } from "@/components/ui/Panel";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { NBA_SCHEDULE } from "@/config/schedule";
import { formatOrdinal, formatRecord } from "@/lib/format";
import { conferencePosition, heatLabel, recentResults } from "@/lib/nba-schedule/form";
import type { TeamInfo } from "@/lib/types";
import type { GameStakes } from "@/server/nba-pages";
import type { TeamForms } from "@/server/nba-schedule";

async function TeamForm({ forms, teamId }: { forms: Promise<TeamForms>; teamId: string }) {
  const log = (await forms).logs[teamId];
  const results = log ? recentResults(log, NBA_SCHEDULE.formGames) : [];
  if (results.length === 0) return <p className="text-sm text-fog-400">Form unavailable</p>;
  const label = heatLabel(results);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fog-300">
      <span className="text-xs uppercase tracking-wider text-fog-400">Last {results.length}</span>
      <FormChips results={results} />
      <HeatBadge results={results} />
      {label && <span>{label}</span>}
    </div>
  );
}

/** How many of the viewer's picks, fades and challenge sides root for the team, and the team's page in each of their leagues. */
async function TeamStakes({ team, stakes }: { team: TeamInfo; stakes: Promise<GameStakes> }) {
  const { leagues, challenge, split, seated } = await stakes;
  if (leagues.length === 0 && challenge === null && seated.length === 0) return null;
  const count = split[team.id] ?? 0;
  return (
    <div className="flex flex-col gap-1 text-sm">
      {(leagues.length > 0 || challenge !== null) && (
        <p className="text-fog-300">
          If the {team.name} win: <span className="font-semibold text-fog-50">{count === 1 ? "1 interest" : `${count} interests`}</span>
        </p>
      )}
      {seated.map((league) => (
        <Link
          key={league.id}
          href={`/l/${league.id}/teams/${team.id}`}
          className="w-fit text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {team.name} in {league.name} →
        </Link>
      ))}
    </div>
  );
}

function TeamBlock({
  team,
  teams,
  forms,
  stakes,
}: {
  team: TeamInfo;
  teams: TeamInfo[];
  forms: Promise<TeamForms>;
  stakes: Promise<GameStakes>;
}) {
  const position = conferencePosition(teams, team.id);
  return (
    <div className="flex flex-col gap-2 px-4 py-4 sm:px-5">
      <div className="flex items-center gap-3">
        <TeamLogo team={team} size={32} />
        <div className="min-w-0">
          <p className="truncate font-semibold text-fog-50">
            {team.city} {team.name}
          </p>
          <p className="text-sm text-fog-300 tabular-nums">
            {formatRecord(team.wins, team.losses)}
            {position && ` · ${formatOrdinal(position.rank)} in ${position.conference}`}
          </p>
        </div>
      </div>
      <Suspense fallback={<p className="text-sm text-fog-400">Loading form…</p>}>
        <TeamForm forms={forms} teamId={team.id} />
      </Suspense>
      <Suspense fallback={null}>
        <TeamStakes team={team} stakes={stakes} />
      </Suspense>
    </div>
  );
}

/** One block per team: record, conference position, last five, hot or cold, and what rides on a win. */
export function TeamContext({
  awayId,
  homeId,
  teams,
  forms,
  stakes,
}: {
  awayId: string;
  homeId: string;
  teams: TeamInfo[];
  forms: Promise<TeamForms>;
  stakes: Promise<GameStakes>;
}) {
  const blocks = [awayId, homeId].map((id) => teams.find((t) => t.id === id)).filter((t): t is TeamInfo => t !== undefined);
  return (
    <Panel title="Team context" bodyClassName="divide-y divide-ink-700">
      {blocks.map((team) => (
        <TeamBlock key={team.id} team={team} teams={teams} forms={forms} stakes={stakes} />
      ))}
    </Panel>
  );
}
