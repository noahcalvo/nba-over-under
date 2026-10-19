import { Suspense } from "react";
import { LinkTabs } from "@/components/nba/LinkTabs";
import { FormsNote, TeamFormCell } from "@/components/nba/FormChips";
import { Panel } from "@/components/ui/Panel";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { conferenceTable, formatPct } from "@/lib/nba-schedule/form";
import { scheduleHref, type ScheduleParams } from "@/lib/nba-schedule/params";
import type { TeamInfo } from "@/lib/types";
import type { TeamForms } from "@/server/nba-schedule";

const HEAD = "px-1.5 py-2 text-right text-xs font-semibold uppercase tracking-wider text-fog-400";

/** One conference's standings. W–L is stored data and shows at once; the last-5 cells stream in. */
export function StandingsPanel({
  params,
  teams,
  forms,
}: {
  params: ScheduleParams;
  teams: TeamInfo[];
  forms: Promise<TeamForms>;
}) {
  const rows = conferenceTable(teams, params.conference);
  const tabs = (["West", "East"] as const).map((conference) => ({
    label: conference,
    href: scheduleHref(params, { conference }),
    active: params.conference === conference,
  }));
  return (
    <Panel title="Standings" actions={<LinkTabs ariaLabel="Conference" options={tabs} />} className="@container">
      <table className="w-full table-fixed text-sm">
        <caption className="sr-only">{params.conference}ern Conference standings by win percentage</caption>
        <thead>
          <tr className="border-b border-ink-700">
            <th scope="col" className={`${HEAD} w-8 pl-4 sm:pl-5`}>#</th>
            <th scope="col" className={`${HEAD} !text-left`}>Team</th>
            <th scope="col" className={`${HEAD} w-6`}>W</th>
            <th scope="col" className={`${HEAD} w-6`}>L</th>
            <th scope="col" className={`${HEAD} w-11`}>PCT</th>
            <th scope="col" className={`${HEAD} w-[8.25rem] !text-left @md:w-40`}>Last 5</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map(({ rank, team, wins, losses, pct }) => (
            <tr key={team.id} className="border-b border-ink-700/60 last:border-0">
              <td className="py-2 pl-4 pr-1.5 text-right text-fog-400 sm:pl-5">{rank}</td>
              <td className="px-1.5 py-2">
                <span className="flex min-w-0 items-center gap-2 text-fog-50">
                  <TeamLogo team={team} size={22} />
                  <span className="truncate font-semibold">
                    <span className="@md:hidden">{team.id}</span>
                    <span className="hidden @md:inline">{team.city} {team.name}</span>
                  </span>
                </span>
              </td>
              <td className="px-1.5 py-2 text-right text-fog-50">{wins}</td>
              <td className="px-1.5 py-2 text-right text-fog-50">{losses}</td>
              <td className="px-1.5 py-2 text-right text-fog-300">{formatPct(pct)}</td>
              <td className="py-2 pl-1.5 pr-2">
                <Suspense fallback={<span className="text-fog-400">—</span>}>
                  <TeamFormCell forms={forms} teamId={team.id} />
                </Suspense>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Suspense fallback={null}>
        <FormsNote forms={forms} />
      </Suspense>
    </Panel>
  );
}
