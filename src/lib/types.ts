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
  source: string;
  /** ISO 8601 timestamp. */
  asOf: string;
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
  /** Lines frozen when the draft started. Null until then. */
  lines: LineSet | null;
}

/** What the server hands a client: the league plus who is looking at it. */
export interface LeagueView {
  league: League;
  viewerId: string | null;
  /** Every team with the lines this view scores against: the league's frozen lines, or current lines before the draft starts. */
  teams: Team[];
}
