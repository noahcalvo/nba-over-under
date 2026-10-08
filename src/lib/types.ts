import type { RecordStatus } from "@/lib/records/types";
/** NBA tricode, e.g. "MIN". */
export type TeamId = string;
export type Side = "OVER" | "UNDER";
export type Conference = "East" | "West";

export interface Team {
  id: TeamId;
  /** NBA stats team id, used for the CDN logo URL. */
  nbaId: number;
  city: string;
  name: string;
  conference: Conference;
  /** Primary color (hex) for the abbreviation-badge fallback. */
  color: string;
  /** Season win-total line, from the LineSet the league scores against. */
  line: number;
  /** Previous regular-season wins. */
  prevWins: number;
  /** Current-season wins so far. */
  wins: number;
  /** Current-season losses so far. */
  losses: number;
}

/** Team metadata without a line. Lines come from a LineSet. */
export type TeamInfo = Omit<Team, "line">;

/** Season win-total lines for every team, from one source at one moment. */
export interface LineSet {
  /** teamId → line. */
  values: Readonly<Record<TeamId, number>>;
  /** The sportsbook the lines came from, e.g. "FanDuel"; "Commissioner" when every line was entered by hand. */
  source: string;
  /** The season the lines are for, e.g. "2026–27". */
  season: string;
  /** ISO 8601 timestamp: when the source was read. */
  asOf: string;
  /** Teams whose line the commissioner entered instead of the source's. Sorted; empty for a pure source set. */
  manual: readonly TeamId[];
}

export interface Manager {
  /** "m1".."m4". */
  id: string;
  /** 0-based draft seat; round 1 picks in seat order. */
  seat: number;
  /** Set when a person claims the seat. Null means an open seat. */
  displayName: string | null;
}

export interface DraftPick {
  /** 1-based overall pick number. */
  pickNumber: number;
  managerId: string;
  teamId: TeamId;
  side: Side;
}

export type DraftStatus = "not_started" | "live" | "paused" | "complete";

export interface DraftState {
  status: DraftStatus;
  rounds: number;
  /** Manager ids in seat order. */
  seatOrder: string[];
  /** Picks in pick-number order. */
  picks: DraftPick[];
}

export interface Fade {
  id: string;
  /** Manager who placed the fade. */
  managerId: string;
  /** Overall pick number of the opponent pick being faded. */
  targetPickNumber: number;
}

export interface League {
  id: string;
  name: string;
  seasonLabel: string;
  isDemo: boolean;
  commissionerId: string;
  /** Incremented on every mutation; clients ignore responses older than what they hold. */
  version: number;
  managers: Manager[];
  draft: DraftState;
  fades: Fade[];
  /** Lines the commissioner entered before the draft. They replace or fill in the source's lines until the draft starts. */
  lineOverrides: Readonly<Record<TeamId, number>>;
  /** Lines frozen when the draft started. Null until then. */
  lines: LineSet | null;
}

/** One team in the pre-draft line review. */
export interface LineReviewRow {
  team: TeamInfo;
  /** The source's line, or null when the source has none. */
  feed: number | null;
  /** The commissioner's line, or null. */
  override: number | null;
  /** What the draft would freeze: the override, else the source's line. Null means missing. */
  line: number | null;
}

/** Lines before the draft starts, for the commissioner to check. */
export interface LineReview {
  /** The sportsbook, e.g. "FanDuel". */
  book: string;
  season: string;
  /** When the source was last read successfully. Null when it never was. */
  asOf: string | null;
  /** Why the latest read failed. Null when it succeeded. */
  feedError: string | null;
  /** One row per team, in team order. */
  rows: LineReviewRow[];
  /** teamId → effective line, for teams that have one. */
  lines: Readonly<Record<TeamId, number>>;
  overrides: Readonly<Record<TeamId, number>>;
  /** Teams with no line yet. The draft can't start until this is empty. */
  missing: TeamId[];
}

/** What the server hands a client: the league plus who is looking at it. */
export interface LeagueView {
  league: League;
  viewerId: string | null;
  /** Teams with the lines this view scores against: the league's frozen lines, or before the draft the reviewed lines (teams still missing a line are left out). */
  teams: Team[];
  /** Before the draft: the lines to review. Null once lines are frozen. */
  lineReview: LineReview | null;
  /** When this league's season records last updated. Null for the demo league, whose records are mock data. */
  records: RecordStatus | null;
}
