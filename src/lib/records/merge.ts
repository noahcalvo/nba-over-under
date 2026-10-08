import type { TeamId } from "@/lib/types";
import type { SeasonRecords, TeamRecord } from "./types";

/** Teams with their records replaced from `records`. A team with no record has played no games (0–0). */
export function withRecords<T extends TeamRecord & { id: TeamId }>(teams: readonly T[], records: SeasonRecords): T[] {
  return teams.map((team) => {
    const record = records[team.id];
    return { ...team, wins: record?.wins ?? 0, losses: record?.losses ?? 0 };
  });
}
