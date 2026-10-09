import { chartWindow, windowSubtitle, yAxis, type ChartMode, type ChartWindow, type YAxis } from "@/lib/chart-window";
import type { TeamRecord } from "@/lib/records/types";
import { gamesPlayed } from "@/lib/scoring";
import { actualSeries, lockedPace, projectedAt, type HistoryStatus } from "./progress";
import type { Game } from "./types";

/** One game position on the chart. Null values are not drawn. */
export interface ChartPoint {
  game: number;
  /** Cumulative wins after this game; null for upcoming games or when the log lacks it. */
  actual: number | null;
  /** Wins the locked line implies by this game; null before lines are frozen. */
  pace: number | null;
  /** Projected cumulative wins from the current game on; null when hidden or unavailable. */
  projected: number | null;
  /** The game itself (date, opponent, result) when the log has it. */
  detail: Game | null;
}

export interface ChartModel {
  mode: ChartMode;
  window: ChartWindow;
  subtitle: string;
  points: ChartPoint[];
  axis: YAxis;
  /** Null without a game log. */
  history: HistoryStatus | null;
  /** Completed games the log covers (up to the record's games played). */
  historyGames: number;
  showsProjected: boolean;
  /** False when no series has a single value (before the draft and the first game). */
  hasData: boolean;
}

export function buildChartModel({
  games,
  record,
  line,
  mode,
  showProjected,
}: {
  games: readonly Game[] | null;
  record: TeamRecord;
  line: number | null;
  mode: ChartMode;
  showProjected: boolean;
}): ChartModel {
  const played = gamesPlayed(record);
  const window = chartWindow(played, mode);
  const series = games ? actualSeries(games, record) : null;
  const completed = games ? games.filter((game) => game.result !== null) : [];
  // Positions after the current game: completed games the record doesn't count yet, then upcoming games, in order.
  const later = games ? [...completed.slice(played), ...games.filter((game) => game.result === null)] : [];

  const points: ChartPoint[] = [];
  for (let game = window.first; game <= window.last; game += 1) {
    const actualPoint = series?.points[game - 1];
    points.push({
      game,
      actual: actualPoint ? actualPoint.wins : null,
      pace: line === null ? null : lockedPace(line, game),
      projected: showProjected && game >= played ? projectedAt(record, game) : null,
      detail: game <= played ? (actualPoint?.source ?? null) : (later[game - played - 1] ?? null),
    });
  }

  const values = points.flatMap((point) =>
    [point.actual, point.pace, point.projected].filter((value): value is number => value !== null),
  );
  return {
    mode,
    window,
    subtitle: windowSubtitle(window, mode),
    points,
    axis: yAxis(mode === "full" ? [0, ...values] : values, mode),
    history: series?.status ?? null,
    historyGames: series?.points.length ?? 0,
    showsProjected: points.some((point) => point.projected !== null),
    hasData: values.length > 0,
  };
}
