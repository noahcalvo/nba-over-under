import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { SignedValue } from "@/components/ui/SignedValue";
import { leaderboardSubtitle, paceText } from "@/lib/challenge/leaderboard";
import { isLocked } from "@/lib/challenge/phase";
import type { LeaderboardData, LeaderboardRow } from "@/server/challenge-pages";
import { ChallengePageHeader } from "./ChallengePageHeader";

const DASH = "–";

/** Before the lock only the entrant's own name links (the others' picks are hidden). */
function EntrantName({ row, linked }: { row: LeaderboardRow; linked: boolean }) {
  if (!linked && !row.isViewer) return <span className="font-medium text-fog-50">{row.displayName}</span>;
  return (
    <Link href={`/challenge/entries/${row.id}`} className="font-medium text-fog-50 hover:underline focus-visible:underline">
      {row.displayName}
    </Link>
  );
}

function Rank({ rank }: { rank: number | null }) {
  return <span className="tabular-nums">{rank === null ? DASH : `#${rank}`}</span>;
}

function Score({ score }: { score: number | null }) {
  return <SignedValue value={score} digits={2} empty={DASH} className="font-semibold" />;
}

const rowClass = (row: LeaderboardRow) =>
  row.isViewer ? "border-l-2 border-accent bg-accent/10" : "border-l-2 border-transparent";

/** Before the lock: the entrant names, no ranks or scores. */
function NameList({ rows }: { rows: LeaderboardRow[] }) {
  return (
    <ol className="divide-y divide-ink-700">
      {rows.map((row) => (
        <li key={row.id} className={`flex items-center gap-3 px-4 py-3 sm:px-5 ${rowClass(row)}`}>
          <span className="min-w-0 flex-1 truncate">
            <EntrantName row={row} linked={false} />
          </span>
          {row.isViewer && <Badge tone="accent">You</Badge>}
        </li>
      ))}
    </ol>
  );
}

function RankedTable({ rows, data }: { rows: LeaderboardRow[]; data: LeaderboardData }) {
  return (
    <table className="hidden w-full text-sm @2xl:table">
      <thead className="text-left text-xs uppercase tracking-wider text-fog-400">
        <tr className="border-b border-ink-700">
          <th scope="col" className="w-20 px-5 py-3 font-semibold">Rank</th>
          <th scope="col" className="px-3 py-3 font-semibold">Entrant</th>
          <th scope="col" className="px-3 py-3 text-right font-semibold">{data.basis === "final" ? "Final score" : "Projected score"}</th>
          <th scope="col" className="px-5 py-3 text-right font-semibold">Picks</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className={`border-b border-ink-700/70 last:border-0 ${rowClass(row)}`}>
            <td className="px-5 py-3 text-fog-300">
              <Rank rank={row.rank} />
            </td>
            <td className="px-3 py-3">
              <span className="flex items-center gap-2">
                <EntrantName row={row} linked />
                {row.isViewer && <Badge tone="accent">You</Badge>}
              </span>
            </td>
            <td className="px-3 py-3 text-right text-base">
              <Score score={row.score} />
            </td>
            <td className="px-5 py-3 text-right text-fog-300">
              {paceText(data.phase, row.score, row.onPace, row.scored) ?? DASH}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RankedCards({ rows, data }: { rows: LeaderboardRow[]; data: LeaderboardData }) {
  return (
    <ol className="divide-y divide-ink-700 @2xl:hidden">
      {rows.map((row) => {
        const pace = paceText(data.phase, row.score, row.onPace, row.scored);
        return (
          <li key={row.id} className={`flex items-center gap-3 px-4 py-3 ${rowClass(row)}`}>
            <span className="w-10 shrink-0 text-fog-300">
              <Rank rank={row.rank} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2">
                <span className="min-w-0 truncate">
                  <EntrantName row={row} linked />
                </span>
                {row.isViewer && <Badge tone="accent">You</Badge>}
              </p>
              {pace && <p className="text-xs text-fog-400">{pace}</p>}
            </div>
            <span className="shrink-0 text-base">
              <Score score={row.score} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The public leaderboard. Server-rendered from loader data only; nothing here reads the session. */
export function Leaderboard({ data }: { data: LeaderboardData }) {
  const { rows, phase, season } = data;
  const locked = isLocked(phase);
  return (
    <div className="flex flex-col gap-6">
      <ChallengePageHeader
        title="Leaderboard"
        subtitle={leaderboardSubtitle(phase, rows.length, season?.deadline ?? null, season?.frozen?.lockedAt ?? null)}
      />
      {rows.length === 0 ? (
        <Panel bodyClassName="flex flex-col items-start gap-4 p-5">
          <p className="text-lg font-semibold text-fog-50">No entries yet.</p>
          <Link href="/challenge" className={buttonClasses("primary")}>
            Make your picks
          </Link>
        </Panel>
      ) : (
        <Panel title="Entrants" actions={<span className="text-sm text-fog-400">{rows.length}</span>}>
          <div className="@container">
            {locked ? (
              <>
                <RankedTable rows={rows} data={data} />
                <RankedCards rows={rows} data={data} />
              </>
            ) : (
              <NameList rows={rows} />
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
