import { isGameDay, todayGameDay } from "@/lib/nba-schedule/game-day";
import type { Conference } from "@/lib/types";

export type ScheduleView = "games" | "standings";

export interface ScheduleParams {
  /** The game day shown (`YYYY-MM-DD`, Central). */
  day: string;
  view: ScheduleView;
  conference: Conference;
}

/**
 * The schedule page's state from its query string. An invalid or missing date is today; any real date is kept, however
 * old. Nothing else is read: no league, player or seat id ever travels in these URLs.
 */
export function resolveScheduleParams(params: { date?: string; view?: string; conf?: string }, now: Date): ScheduleParams {
  return {
    day: isGameDay(params.date) ? params.date : todayGameDay(now),
    view: params.view === "standings" ? "standings" : "games",
    conference: params.conf === "east" ? "East" : "West",
  };
}

/** A schedule link with some parameters changed; `day: null` drops the date (so the link follows today). Defaults are omitted. */
export function scheduleHref(current: ScheduleParams, change: { day?: string | null; view?: ScheduleView; conference?: Conference } = {}): string {
  const day = change.day === undefined ? current.day : change.day;
  const view = change.view ?? current.view;
  const conference = change.conference ?? current.conference;
  const query = new URLSearchParams();
  if (day) query.set("date", day);
  if (view === "standings") query.set("view", "standings");
  if (conference === "East") query.set("conf", "east");
  const text = query.toString();
  return text ? `/nba?${text}` : "/nba";
}
