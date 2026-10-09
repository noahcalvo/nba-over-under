import { SCORING, type ScoringConfig } from "@/config/scoring";
import { fadeStatus, type FadeStatus, type StatusTone } from "@/lib/fade-status";
import { formatNumber } from "@/lib/format";
import { gamesRemaining } from "@/lib/game-log/progress";
import type { GameLogRead } from "@/lib/game-log/types";
import { findManager } from "@/lib/league/managers";
import type { FeedRead } from "@/lib/lines";
import type { TeamRecord } from "@/lib/records/types";
import { evaluateCall, evaluateFade, type CallEvaluation, type FadeEvaluation } from "@/lib/scoring";
import type { DraftPick, Fade, League, Manager, Side, Team, TeamId, TeamInfo } from "@/lib/types";

export interface TeamOption {
  id: TeamId;
  label: string;
}

/** The latest sportsbook line for one team. Display only: league scoring uses the frozen line. */
export interface MarketLine {
  book: string;
  /** Null when the book has no current market for the team in the league's season. */
  line: number | null;
  /** When the lines shown were read. Null without a read for this season. */
  asOf: string | null;
  /** Why the latest read failed. Null when it succeeded. */
  error: string | null;
}

/** What the team page's server loader hands the client. */
export interface TeamPageData {
  league: League;
  /** Metadata and this league's record for the team. */
  info: TeamInfo;
  /** The league's frozen line. Null before the draft starts. */
  lockedLine: number | null;
  /** Every team, sorted by full name, for the team selector. */
  teamOptions: TeamOption[];
  /** Streamed: both promises resolve after the page first renders and never reject. */
  gameLog: Promise<GameLogRead>;
  market: Promise<MarketLine>;
}

export interface FadeOnPick {
  fade: Fade;
  manager: Manager;
  projected: FadeEvaluation;
  final: FadeEvaluation;
}

/** One side of a team: who holds it, its scores on both bases and the fades on it. */
export interface SideOwnership {
  side: Side;
  /** The frozen line. Null before the draft starts. */
  line: number | null;
  /** Null when undrafted. */
  pick: DraftPick | null;
  manager: Manager | null;
  projected: CallEvaluation | null;
  final: CallEvaluation | null;
  /** Fades on this pick, in seat order. */
  fades: FadeOnPick[];
}

const SIDES: readonly Side[] = ["OVER", "UNDER"];

/** The Over and the Under of a team. `team` (with the frozen line) is null before the draft starts. */
export function teamOwnership(
  league: Pick<League, "managers" | "draft" | "fades">,
  teamId: TeamId,
  team: Team | null,
  config: ScoringConfig = SCORING,
): [SideOwnership, SideOwnership] {
  const [over, under] = SIDES.map((side): SideOwnership => {
    const line = team?.line ?? null;
    const pick = league.draft.picks.find((candidate) => candidate.teamId === teamId && candidate.side === side) ?? null;
    if (!pick || !team) return { side, line, pick: null, manager: null, projected: null, final: null, fades: [] };
    const projected = evaluateCall(side, team, "projected", config);
    const final = evaluateCall(side, team, "final", config);
    const fades = league.fades
      .filter((fade) => fade.targetPickNumber === pick.pickNumber)
      .flatMap((fade): FadeOnPick[] => {
        const manager = findManager(league.managers, fade.managerId);
        return manager
          ? [{ fade, manager, projected: evaluateFade(projected, config), final: evaluateFade(final, config) }]
          : [];
      })
      .sort((a, b) => a.manager.seat - b.manager.seat);
    const manager = findManager(league.managers, pick.managerId) ?? null;
    return { side, line, pick, manager, projected, final, fades };
  });
  return [over, under];
}

export type Decided = "clinched" | "eliminated";

/**
 * Whether the record alone already settles a side, whatever happens in the remaining games. Display arithmetic on the
 * existing rule (a call hits when its signed margin is above 0), not a scoring rule.
 */
export function decidedOutcome(
  side: Side,
  line: number,
  record: TeamRecord,
  config: ScoringConfig = SCORING,
): Decided | null {
  const maxWins = record.wins + gamesRemaining(record, config);
  if (side === "OVER") {
    if (record.wins > line) return "clinched";
    if (maxWins <= line) return "eliminated";
  } else {
    if (maxWins < line) return "clinched";
    if (record.wins >= line) return "eliminated";
  }
  return null;
}

export interface DisplayStatus {
  label: string;
  tone: StatusTone;
}

const DECIDED_LABELS: Record<Side, Record<Decided, string>> = {
  OVER: {
    clinched: "Clinched · already past the line",
    eliminated: "Can no longer hit · can't get past the line",
  },
  UNDER: {
    clinched: "Clinched · can't get past the line",
    eliminated: "Can no longer hit · already at or past the line",
  },
};

/**
 * One line of text saying how a drafted side stands: the final result once settled; with Show projected on, whether
 * the projection hits; otherwise only an outcome the record already decides. Null for an undrafted side or nothing to say.
 */
export function pickStatus(ownership: SideOwnership, record: TeamRecord, showProjected: boolean): DisplayStatus | null {
  const { side, line, pick, projected, final } = ownership;
  if (!pick || line === null || !projected || !final) return null;
  if (final.status === "scored") {
    const text = `${formatNumber(final.wins ?? 0, 0)} wins vs ${formatNumber(line)}`;
    if (final.push) return { label: `Push · ${text}`, tone: "neutral" };
    return final.correct ? { label: `Hit · ${text}`, tone: "accent" } : { label: `Missed · ${text}`, tone: "danger" };
  }
  if (showProjected) {
    if (projected.status !== "scored") return { label: "No games played yet", tone: "neutral" };
    const text = `projected ${formatNumber(projected.wins ?? 0)} vs ${formatNumber(line)}`;
    if (projected.push) return { label: `On track to push · ${text}`, tone: "neutral" };
    return projected.correct
      ? { label: `On track to hit · ${text}`, tone: "accent" }
      : { label: `On track to miss · ${text}`, tone: "danger" };
  }
  const decided = decidedOutcome(side, line, record);
  if (!decided) return null;
  return { label: DECIDED_LABELS[side][decided], tone: decided === "clinched" ? "accent" : "danger" };
}

/** Final points once settled; projected points only with Show projected on. A null value means "Not available". */
export function pickPoints(
  ownership: SideOwnership,
  showProjected: boolean,
): { label: "Final points" | "Projected points"; value: number | null } | null {
  const { pick, projected, final } = ownership;
  if (!pick || !projected || !final) return null;
  if (final.status === "scored") return { label: "Final points", value: final.points };
  if (showProjected) return { label: "Projected points", value: projected.points };
  return null;
}

/** A fade's status and points: final once settled, projected with Show projected on. Null before its target plays. */
export function fadeDisplay(
  fade: FadeOnPick,
  showProjected: boolean,
): { status: FadeStatus; points: number; pointsLabel: "pts" | "projected pts" } | null {
  if (fade.final.status === "scored") {
    return { status: fadeStatus(fade.final), points: fade.final.points ?? 0, pointsLabel: "pts" };
  }
  if (showProjected && fade.projected.status === "scored") {
    return { status: fadeStatus(fade.projected), points: fade.projected.points ?? 0, pointsLabel: "projected pts" };
  }
  return null;
}

/** The team's current line from the latest read, only when that read is for the league's season. */
export function latestMarketLine(read: FeedRead, book: string, seasonLabel: string, teamId: TeamId): MarketLine {
  const lines = read.lines;
  if (!lines || lines.season !== seasonLabel) return { book, line: null, asOf: null, error: read.error };
  return { book: lines.source, line: lines.values[teamId] ?? null, asOf: lines.asOf, error: read.error };
}

/** Latest minus locked, only when both exist. */
export function lineMovement(latest: number | null, locked: number | null): number | null {
  return latest === null || locked === null ? null : latest - locked;
}
