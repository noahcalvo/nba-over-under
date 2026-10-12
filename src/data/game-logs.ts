import type { Game, GameLog } from "@/lib/game-log/types";
import { seededRandom, seedFor } from "@/lib/random";
import type { TeamInfo } from "@/lib/types";

// The mock dataset's game-by-game results, for the demo league and RECORD_SOURCE=static. Each team's mock wins and
// losses in a fixed order (a shuffle seeded by the team id), so the chart has a believable curve that adds up to the
// mock record. No dates, opponents or venues: we never invent them, and no upcoming games are listed.

export function mockGameLog(team: Pick<TeamInfo, "id" | "wins" | "losses">, season: number): GameLog {
  const results: Array<"W" | "L"> = [...Array<"W">(team.wins).fill("W"), ...Array<"L">(team.losses).fill("L")];
  const random = seededRandom(seedFor(team.id));
  for (let i = results.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [results[i], results[j]] = [results[j], results[i]];
  }
  const games: Game[] = results.map((result, index) => ({
    number: index + 1,
    date: null,
    opponentId: null,
    home: null,
    result,
  }));
  return { season, teamId: team.id, games };
}
