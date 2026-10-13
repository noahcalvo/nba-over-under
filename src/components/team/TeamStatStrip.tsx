import { SCORING } from "@/config/scoring";
import { formatNumber, formatRecord, NOT_AVAILABLE } from "@/lib/format";
import { gamesRemaining, winsNeededForOver } from "@/lib/game-log/progress";
import type { TeamRecord } from "@/lib/records/types";
import { gamesPlayed, isSettled, projectWins } from "@/lib/scoring";
import { tourTarget } from "@/lib/tour/targets";

interface Stat {
  label: string;
  value: string;
  sub?: string;
}

const COLUMNS: Record<number, string> = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" };

function versusLine(diff: number): string {
  const text = formatNumber(Math.abs(diff));
  if (text === "0.0") return "On the line";
  return `${text} ${diff > 0 ? "above" : "below"} line`;
}

function remainingText(needed: number, remaining: number): string {
  if (remaining === 0) return "Season complete";
  const games = `${remaining} ${remaining === 1 ? "game" : "games"} remaining`;
  if (needed === 0) return `${games} · Clinched`;
  return needed > remaining ? `${games} · Out of reach` : games;
}

export interface LineLabels {
  label: string;
  /** Under the value while there is no line yet. */
  unset: string;
  /** Under the value once the line is fixed. */
  set: string;
}

const DRAFT_LINE_LABELS: LineLabels = { label: "Locked line", unset: "Set at draft start", set: "Frozen at draft" };

export function TeamStatStrip({
  record,
  lockedLine,
  showProjected,
  lineLabels = DRAFT_LINE_LABELS,
}: {
  record: TeamRecord;
  lockedLine: number | null;
  showProjected: boolean;
  /** How the fixed line is named; a league freezes at the draft start, the challenge at its deadline. */
  lineLabels?: LineLabels;
}) {
  const projected = projectWins(record);
  const stats: Stat[] = [
    {
      label: "Record",
      value: formatRecord(record.wins, record.losses),
      sub: `${gamesPlayed(record)} of ${SCORING.seasonGames} games`,
    },
    lockedLine === null
      ? { label: lineLabels.label, value: "—", sub: lineLabels.unset }
      : { label: lineLabels.label, value: formatNumber(lockedLine), sub: lineLabels.set },
  ];
  if (isSettled(record)) {
    // A finished season has final wins, not a projection.
    stats.push({
      label: "Final wins",
      value: formatNumber(record.wins, 0),
      sub: lockedLine === null ? undefined : versusLine(record.wins - lockedLine),
    });
  } else if (showProjected) {
    stats.push({
      label: "Projected wins",
      value: projected === null ? NOT_AVAILABLE : formatNumber(projected),
      sub: projected === null || lockedLine === null ? undefined : versusLine(projected - lockedLine),
    });
  }
  if (lockedLine !== null) {
    const needed = winsNeededForOver(lockedLine, record.wins);
    stats.push({ label: "Wins needed for Over", value: String(needed), sub: remainingText(needed, gamesRemaining(record)) });
  }
  return (
    <section aria-label="Season summary" {...tourTarget("team-stats")} className="rounded-xl border border-ink-700 bg-ink-850/90">
      <dl className={`grid grid-cols-2 gap-y-5 py-5 ${COLUMNS[stats.length]}`}>
        {stats.map((stat) => (
          <div key={stat.label} className="flex min-w-0 flex-col items-center px-3 text-center sm:border-l sm:border-ink-700 sm:first:border-l-0">
            <dt className="text-base text-fog-300">{stat.label}</dt>
            <dd
              className={`font-display font-bold tabular-nums text-fog-50 ${
                stat.value === NOT_AVAILABLE ? "py-2 text-2xl" : "text-4xl sm:text-5xl"
              }`}
            >
              {stat.value}
            </dd>
            {stat.sub && <dd className="text-sm text-fog-300">{stat.sub}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}
