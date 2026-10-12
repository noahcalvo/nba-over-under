import { LEAGUE_LIMITS } from "@/config/league";
import { TOTAL_SIDES } from "@/data/teams";
import type { Manager } from "@/lib/types";

// League size before the draft: how many managers and how many rounds. Every pick takes one of the 60 sides, so
// managers × rounds can't exceed them.

export interface LeagueConfig {
  managerCount: number;
  rounds: number;
}

/** Most rounds a league of this size can draft. */
export function maxRounds(managerCount: number, sideCount: number = TOTAL_SIDES): number {
  return Math.floor(sideCount / managerCount);
}

export function isValidLeagueConfig({ managerCount, rounds }: LeagueConfig, sideCount: number = TOTAL_SIDES): boolean {
  return (
    Number.isInteger(managerCount) &&
    Number.isInteger(rounds) &&
    managerCount >= LEAGUE_LIMITS.minManagers &&
    managerCount <= LEAGUE_LIMITS.maxManagers &&
    rounds >= LEAGUE_LIMITS.minRounds &&
    rounds <= maxRounds(managerCount, sideCount)
  );
}

/** An untrusted request body as a config with integer fields, or null. Ranges are isValidLeagueConfig's job. */
export function parseLeagueConfig(input: unknown): LeagueConfig | null {
  if (!input || typeof input !== "object") return null;
  const { managerCount, rounds } = input as Record<string, unknown>;
  if (typeof managerCount !== "number" || !Number.isInteger(managerCount)) return null;
  if (typeof rounds !== "number" || !Number.isInteger(rounds)) return null;
  return { managerCount, rounds };
}

/** The fewest managers the league can shrink to: seats are removed from the end, and claimed seats never are. */
export function minManagerCount(managers: readonly Manager[]): number {
  const lastClaimed = Math.max(-1, ...managers.filter((manager) => manager.displayName !== null).map((m) => m.seat));
  return Math.max(LEAGUE_LIMITS.minManagers, lastClaimed + 1);
}

/** Seats for a new size: existing seats kept in seat order, trailing seats dropped, new open seats `m{seat + 1}` added. */
export function resizeSeats(managers: readonly Manager[], managerCount: number): Manager[] {
  const kept = [...managers].sort((a, b) => a.seat - b.seat).slice(0, managerCount);
  for (let seat = kept.length; seat < managerCount; seat++) kept.push({ id: `m${seat + 1}`, seat, displayName: null });
  return kept;
}
