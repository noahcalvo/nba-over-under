import { SCORING, type ScoringConfig } from "@/config/scoring";
import { formatNumber, formatOrdinal, formatRecord, formatSigned } from "@/lib/format";
import { findManager, managerLabel } from "@/lib/league/managers";
import { evaluateCall, gamesPlayed, type Basis, type CallEvaluation, type FadeEvaluation } from "@/lib/scoring";
import type { StandingRow, Standings } from "@/lib/standings";
import type { DraftPick, Manager, Side, Team } from "@/lib/types";

// What the guided season says about the user's own picks, fade and place, in their demo numbers. Every number comes
// from the scoring rules (evaluateCall, evaluateFade via computeStandings); this file only puts them into words.
// Breakdowns show points with two decimals (the team page's precision); standings sentences one (the standings panel's).

export interface BreakdownRow {
  label: string;
  value: string;
}

const SIDE_LABEL: Record<Side, string> = { OVER: "Over", UNDER: "Under" };
const BREAKDOWN_DIGITS = 2;
const STANDINGS_DIGITS = 1;

function winsText(count: number, digits: number): string {
  return `${formatNumber(count, digits)} ${count === 1 ? "win" : "wins"}`;
}

export function pickLabel(side: Side, line: number): string {
  return `${SIDE_LABEL[side]} ${formatNumber(line)}`;
}

export interface PickStory {
  evaluation: CallEvaluation;
  /** One sentence: where the team stands against the user's side. */
  summary: string;
  /** The arithmetic, row by row. Empty before the team plays. */
  rows: BreakdownRow[];
}

/** A pick at the checkpoint, on the projected (win pace) or final basis. */
export function pickStory(pick: Pick<DraftPick, "side">, team: Team, basis: Basis, config: ScoringConfig = SCORING): PickStory {
  const evaluation = evaluateCall(pick.side, team, basis, config);
  const played = gamesPlayed(team);
  const label = pickLabel(pick.side, team.line);
  if (evaluation.status !== "scored" || evaluation.wins === null || evaluation.margin === null) {
    return {
      evaluation,
      summary: played === 0 ? "No games played yet, so there's nothing to score." : "Not settled until the season ends.",
      rows: [],
    };
  }
  const { margin, points } = evaluation;
  const projected = basis === "projected";
  const winText = projected ? formatNumber(evaluation.wins) : formatNumber(evaluation.wins, 0);
  const off = winsText(Math.abs(margin), 1);
  const where = `${projected ? "On pace for" : "Finished with"} ${winText} wins against your ${label}`;
  const summary = evaluation.push
    ? `${projected ? "On pace for" : "Finished with"} exactly ${winText} wins, right on your ${label}: a push scores 0.`
    : evaluation.correct
      ? `${where}: ${projected ? "projected to hit" : "correct"} by ${off}.`
      : `${where}: ${projected ? "projected to miss" : "missed"} by ${off}.`;

  const base = evaluation.push ? 0 : evaluation.correct ? config.correctCall : config.missedCall;
  const verdict = evaluation.push ? "push" : evaluation.correct ? (projected ? "on track to hit" : "correct") : projected ? "on track to miss" : "missed";
  const rows: BreakdownRow[] = [
    {
      label: "Record",
      value: `${formatRecord(team.wins, team.losses)} after ${played} ${played === 1 ? "game" : "games"}`,
    },
    projected
      ? { label: "Projected wins", value: `${team.wins} ÷ ${played} × ${config.seasonGames} = ${winText}` }
      : { label: "Final wins", value: winText },
    { label: "Your pick", value: label },
    { label: "Base", value: `${formatSigned(base, 0)} · ${verdict}` },
    {
      label: "Margin",
      value: `${formatSigned(margin)} × ${formatNumber(config.marginWeight)} = ${formatSigned(margin * config.marginWeight, BREAKDOWN_DIGITS)}`,
    },
    { label: projected ? "Projected points" : "Final points", value: formatSigned(points ?? 0, BREAKDOWN_DIGITS) },
  ];
  return { evaluation, summary, rows };
}

export interface FadeStory {
  evaluation: FadeEvaluation;
  target: CallEvaluation;
  /** The faded pick's manager, team, side and line. */
  targetLabel: string;
  summary: string;
}

/** The manager's fade (the first: each manager has one), or null without one. */
export function fadeStory(row: StandingRow, managers: readonly Manager[], config: ScoringConfig = SCORING): FadeStory | null {
  const fade = row.fades[0];
  if (!fade) return null;
  const owner = findManager(managers, fade.target.pick.managerId);
  const { team, pick, evaluation: target } = fade.target;
  const targetLabel = `${owner ? managerLabel(owner) : "Another manager"}'s ${team.name} ${pickLabel(pick.side, team.line)}`;
  const projected = fade.evaluation.basis === "projected";
  let summary: string;
  if (fade.evaluation.status !== "scored" || target.wins === null) {
    summary = `You're fading ${targetLabel}. No games played yet, so the fade has nothing to score.`;
  } else {
    const winText = projected ? `are on pace for ${formatNumber(target.wins)}` : `finished with ${formatNumber(target.wins, 0)}`;
    const outcome = target.push
      ? `exactly on the line, a push: your fade ${projected ? "projects" : "earned"} ${formatSigned(config.fadeMiss, 0)}`
      : fade.evaluation.targetMissed
        ? `so that pick ${projected ? "is on track to miss" : "missed"}: your fade ${projected ? "projects" : "earned"} ${formatSigned(config.fadeHit, 0)}`
        : `so that pick ${projected ? "is on track to hit" : "hit"}: your fade ${projected ? "projects" : "earned"} ${formatSigned(config.fadeMiss, 0)}`;
    summary = `You're fading ${targetLabel}. The ${team.name} ${winText} wins, ${outcome}.`;
  }
  return { evaluation: fade.evaluation, target, targetLabel, summary };
}

export interface StandingsStory {
  /** The leader (or winner) and the viewer's place. */
  summary: string;
  /** The viewer's total: picks, fade, sum. Empty before any game. */
  rows: BreakdownRow[];
  leader: StandingRow;
  viewer: StandingRow;
}

/** The standings in a sentence, ranked exactly as computeStandings ranks them (ties: total margin, then seat). */
export function standingsStory(standings: Standings, managers: readonly Manager[], viewerId: string): StandingsStory {
  const leader = standings.rows[0];
  const viewer = standings.rows.find((row) => row.managerId === viewerId) ?? leader;
  if (!standings.anyScored) {
    return {
      summary: "No games played yet: every manager starts level, with no points and no ranking.",
      rows: [],
      leader,
      viewer,
    };
  }
  const final = standings.basis === "final";
  const points = (row: StandingRow) => `${formatSigned(row.totalPoints, STANDINGS_DIGITS)}${final ? "" : " projected"} points`;
  const leaderName = managerLabel(findManager(managers, leader.managerId) ?? { seat: 0, displayName: null });
  const place = `${formatOrdinal(viewer.rank)} of ${standings.rows.length}`;
  let summary: string;
  if (final) {
    summary =
      viewer === leader
        ? `You win the league with ${points(leader)}!`
        : `${leaderName} wins the league with ${points(leader)}. You finished ${place} with ${points(viewer)}.`;
  } else {
    summary =
      viewer === leader
        ? `You lead with ${points(leader)}.`
        : `${leaderName} leads with ${points(leader)}; you're ${place} with ${points(viewer)}.`;
  }
  const runnerUp = standings.rows[1];
  if (runnerUp && runnerUp.totalPoints === leader.totalPoints) summary += " Level on points at the top: total margin breaks the tie.";
  const prefix = final ? "Final" : "Projected";
  return {
    summary,
    rows: [
      { label: `Your ${viewer.calls.length} picks`, value: formatSigned(viewer.callPoints, BREAKDOWN_DIGITS) },
      { label: "Your fade", value: formatSigned(viewer.fadePoints, 0) },
      { label: `${prefix} total`, value: formatSigned(viewer.totalPoints, BREAKDOWN_DIGITS) },
    ],
    leader,
    viewer,
  };
}
