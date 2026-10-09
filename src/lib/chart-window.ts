import { SCORING } from "@/config/scoring";

/** "last8": the latest completed games and the next upcoming ones, zoomed in. "full": the whole season from zero. */
export type ChartMode = "last8" | "full";

const RECENT_GAMES = 8;
const UPCOMING_GAMES = 2;
/** Share of the plot height the data fills in "last8"; the rest is split evenly above and below. */
const DATA_SHARE = 0.7;
/** Smallest Y range in wins, so a flat stretch doesn't blow up tiny differences. */
const MIN_AXIS_SPAN = 4;
/** Full season: headroom above the highest value, and the smallest top. */
const FULL_HEADROOM = 1.1;
const MIN_FULL_TOP = 10;

/** Game positions shown. `current` is games played; `completed`/`upcoming` count positions on each side of it. */
export interface ChartWindow {
  first: number;
  last: number;
  completed: number;
  upcoming: number;
  current: number;
}

export function chartWindow(played: number, mode: ChartMode, seasonGames = SCORING.seasonGames): ChartWindow {
  if (mode === "full") {
    return { first: 1, last: seasonGames, completed: played, upcoming: seasonGames - played, current: played };
  }
  const first = Math.max(1, played - RECENT_GAMES + 1);
  const last = Math.min(seasonGames, played + UPCOMING_GAMES);
  return { first, last, completed: Math.max(0, played - first + 1), upcoming: last - played, current: played };
}

function games(count: number): string {
  return `${count} completed ${count === 1 ? "game" : "games"}`;
}

export function windowSubtitle(window: ChartWindow, mode: ChartMode, seasonGames = SCORING.seasonGames): string {
  if (mode === "full") return `${window.current} of ${seasonGames} games played`;
  if (window.completed === 0) return `No games played yet · ${window.upcoming} upcoming`;
  if (window.upcoming === 0) return games(window.completed);
  return `${games(window.completed)} + ${window.upcoming} upcoming`;
}

export interface YAxis {
  min: number;
  max: number;
  ticks: number[];
}

/** 1, 2 or 5 × 10ⁿ at or above `raw`; never below 1 (wins are whole). */
function niceStep(raw: number): number {
  if (raw <= 1) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const base = raw / power;
  return (base <= 1 ? 1 : base <= 2 ? 2 : base <= 5 ? 5 : 10) * power;
}

function ticksFor(min: number, max: number, step: number): number[] {
  const ticks: number[] = [];
  // `|| 0` turns the -0 that Math.ceil can produce at the origin into 0.
  for (let value = Math.ceil(min / step - 1e-9) * step; value <= max + 1e-9; value += step) ticks.push(value || 0);
  return ticks;
}

/** Y range for the visible values: zoomed to them in "last8", from zero in "full". */
export function yAxis(values: readonly number[], mode: ChartMode): YAxis {
  const high = values.length ? Math.max(...values) : 0;
  if (mode === "full") {
    const step = niceStep(Math.max(high * FULL_HEADROOM, MIN_FULL_TOP) / 6);
    const max = Math.max(MIN_FULL_TOP, Math.ceil((high * FULL_HEADROOM) / step - 1e-9) * step);
    return { min: 0, max, ticks: ticksFor(0, max, step) };
  }
  const low = values.length ? Math.min(...values) : 0;
  const span = Math.max((high - low) / DATA_SHARE, MIN_AXIS_SPAN);
  const min = Math.max(0, (low + high) / 2 - span / 2);
  const max = min + span;
  return { min, max, ticks: ticksFor(min, max, niceStep(span / 5)) };
}
