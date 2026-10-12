import { TUTORIAL_VIEWER_ID } from "@/data/tutorial-league";
import { currentPickNumber, managerOnTheClock } from "@/lib/draft";
import { fadeFor, type DraftCommand } from "@/lib/fades";
import type { League, Team } from "@/lib/types";
import { applyTutorialCommand } from "./session";
import { chooseFadeTarget, chooseSide } from "./strategy";

// The guided demo's simulated managers. Each step is one command by the manager whose turn or fade it is, decided by
// the same rules as a real league (applyTutorialCommand). Watching step by step and skipping run the same steps.

export type SimulationKind = "draft" | "fades";

export interface SimulatedCommand {
  actorId: string;
  command: DraftCommand;
}

/** The pick the manager on the clock makes (the viewer's later picks included). Null unless a pick is due. */
export function nextSimulatedPick(league: League, teams: readonly Team[]): SimulatedCommand | null {
  const { draft } = league;
  const pickNumber = currentPickNumber(draft);
  const managerId = managerOnTheClock(draft);
  if (draft.status !== "live" || pickNumber === null || managerId === null) return null;
  const choice = chooseSide(draft, managerId, teams);
  return choice && { actorId: managerId, command: { type: "confirm", ...choice, pickNumber } };
}

/** The next fade by a manager other than `except` who has none yet, in seat order. Null when there is none to make. */
export function nextSimulatedFade(league: League, teams: readonly Team[], except: string): SimulatedCommand | null {
  if (league.draft.status !== "fades") return null;
  const manager = league.managers.find((candidate) => candidate.id !== except && !fadeFor(league.fades, candidate.id));
  if (!manager) return null;
  const target = chooseFadeTarget(league.draft, manager.id, teams);
  return target === null
    ? null
    : { actorId: manager.id, command: { type: "fade", managerId: manager.id, targetPickNumber: target } };
}

/** Applies one simulated command; returns the same league when nothing is left to simulate. */
export function simulateStep(league: League, teams: readonly Team[], kind: SimulationKind): League {
  const next = kind === "draft" ? nextSimulatedPick(league, teams) : nextSimulatedFade(league, teams, TUTORIAL_VIEWER_ID);
  if (!next) return league;
  const result = applyTutorialCommand(league, next.actorId, next.command);
  // Unreachable: simulated choices come from the eligible sides and targets (see simulation.test.ts).
  if (!result.ok) throw new Error(`simulated ${next.command.type} refused: ${result.error}`);
  return result.value;
}

/** Simulates until nothing is left: the regular draft for "draft", every fade but the viewer's for "fades". */
export function simulateAll(league: League, teams: readonly Team[], kind: SimulationKind): League {
  let current = league;
  for (let next = simulateStep(current, teams, kind); next !== current; next = simulateStep(current, teams, kind)) {
    current = next;
  }
  return current;
}
