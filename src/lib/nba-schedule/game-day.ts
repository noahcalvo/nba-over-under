import { NBA_SCHEDULE } from "@/config/schedule";

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

const CENTRAL_DATE = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: NBA_SCHEDULE.timeZone,
});

/** A game day (`YYYY-MM-DD`) is the Central date a game tips off. */
export function gameDayOf(iso: string): string {
  const part = Object.fromEntries(CENTRAL_DATE.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${part.year}-${part.month}-${part.day}`;
}

/** The game day that `now` falls in, in Central time. */
export function todayGameDay(now: Date): string {
  return gameDayOf(now.toISOString());
}

/** The day `n` days after `day` (negative `n` goes back). Calendar arithmetic, so no time zone or DST effects. */
export function shiftGameDay(day: string, n: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / MS_PER_DAY);
}

/** True for a real calendar date written `YYYY-MM-DD`. */
export function isGameDay(value: unknown): value is string {
  if (typeof value !== "string" || !DAY_PATTERN.test(value)) return false;
  const ms = Date.parse(`${value}T12:00:00Z`);
  if (Number.isNaN(ms)) return false;
  return new Date(ms).toISOString().slice(0, 10) === value;
}

/** ESPN's scoreboard date parameter: `YYYYMMDD`. */
export function espnDate(day: string): string {
  return day.replace(/-/g, "");
}

/** `n` consecutive game days centred on `day` (when `n` is even, one more day comes before it). */
export function dateStrip(day: string, n: number): string[] {
  const start = shiftGameDay(day, -Math.floor(n / 2));
  return Array.from({ length: n }, (_, i) => shiftGameDay(start, i));
}
