import type { TeamId, TeamInfo } from "@/lib/types";

/** Team metadata. Lines live in a LineSet (see src/lib/lines.ts). */
export const TEAM_INFO: readonly TeamInfo[] = [
  { id: "ATL", nbaId: 1610612737, city: "Atlanta", name: "Hawks", conference: "East", color: "#C8102E", prevWins: 40, wins: 25, losses: 24 },
  { id: "BOS", nbaId: 1610612738, city: "Boston", name: "Celtics", conference: "East", color: "#007A33", prevWins: 61, wins: 22, losses: 26 },
  { id: "BKN", nbaId: 1610612751, city: "Brooklyn", name: "Nets", conference: "East", color: "#2A2A2A", prevWins: 26, wins: 13, losses: 35 },
  { id: "CHA", nbaId: 1610612766, city: "Charlotte", name: "Hornets", conference: "East", color: "#1D1160", prevWins: 19, wins: 17, losses: 30 },
  { id: "CHI", nbaId: 1610612741, city: "Chicago", name: "Bulls", conference: "East", color: "#CE1141", prevWins: 39, wins: 21, losses: 27 },
  { id: "CLE", nbaId: 1610612739, city: "Cleveland", name: "Cavaliers", conference: "East", color: "#860038", prevWins: 64, wins: 33, losses: 15 },
  { id: "DET", nbaId: 1610612765, city: "Detroit", name: "Pistons", conference: "East", color: "#1D42BA", prevWins: 44, wins: 31, losses: 17 },
  { id: "IND", nbaId: 1610612754, city: "Indiana", name: "Pacers", conference: "East", color: "#002D62", prevWins: 50, wins: 18, losses: 30 },
  { id: "MIA", nbaId: 1610612748, city: "Miami", name: "Heat", conference: "East", color: "#98002E", prevWins: 37, wins: 24, losses: 25 },
  { id: "MIL", nbaId: 1610612749, city: "Milwaukee", name: "Bucks", conference: "East", color: "#00471B", prevWins: 48, wins: 22, losses: 26 },
  { id: "NYK", nbaId: 1610612752, city: "New York", name: "Knicks", conference: "East", color: "#006BB6", prevWins: 51, wins: 31, losses: 16 },
  { id: "ORL", nbaId: 1610612753, city: "Orlando", name: "Magic", conference: "East", color: "#0077C0", prevWins: 41, wins: 30, losses: 18 },
  { id: "PHI", nbaId: 1610612755, city: "Philadelphia", name: "76ers", conference: "East", color: "#ED174C", prevWins: 24, wins: 25, losses: 23 },
  { id: "TOR", nbaId: 1610612761, city: "Toronto", name: "Raptors", conference: "East", color: "#CE1141", prevWins: 30, wins: 26, losses: 22 },
  { id: "WAS", nbaId: 1610612764, city: "Washington", name: "Wizards", conference: "East", color: "#002B5C", prevWins: 18, wins: 10, losses: 38 },
  { id: "DAL", nbaId: 1610612742, city: "Dallas", name: "Mavericks", conference: "West", color: "#00538C", prevWins: 39, wins: 20, losses: 28 },
  { id: "DEN", nbaId: 1610612743, city: "Denver", name: "Nuggets", conference: "West", color: "#0E2240", prevWins: 50, wins: 34, losses: 14 },
  { id: "GSW", nbaId: 1610612744, city: "Golden State", name: "Warriors", conference: "West", color: "#1D428A", prevWins: 48, wins: 25, losses: 23 },
  { id: "HOU", nbaId: 1610612745, city: "Houston", name: "Rockets", conference: "West", color: "#CE1141", prevWins: 52, wins: 31, losses: 18 },
  { id: "LAC", nbaId: 1610612746, city: "LA", name: "Clippers", conference: "West", color: "#C8102E", prevWins: 50, wins: 23, losses: 25 },
  { id: "LAL", nbaId: 1610612747, city: "Los Angeles", name: "Lakers", conference: "West", color: "#552583", prevWins: 50, wins: 30, losses: 18 },
  { id: "MEM", nbaId: 1610612763, city: "Memphis", name: "Grizzlies", conference: "West", color: "#5D76A9", prevWins: 48, wins: 21, losses: 27 },
  { id: "MIN", nbaId: 1610612750, city: "Minnesota", name: "Timberwolves", conference: "West", color: "#0C2340", prevWins: 49, wins: 30, losses: 18 },
  { id: "NOP", nbaId: 1610612740, city: "New Orleans", name: "Pelicans", conference: "West", color: "#85714D", prevWins: 21, wins: 12, losses: 37 },
  { id: "OKC", nbaId: 1610612760, city: "Oklahoma City", name: "Thunder", conference: "West", color: "#007AC1", prevWins: 68, wins: 36, losses: 12 },
  { id: "PHX", nbaId: 1610612756, city: "Phoenix", name: "Suns", conference: "West", color: "#1D1160", prevWins: 36, wins: 24, losses: 24 },
  { id: "POR", nbaId: 1610612757, city: "Portland", name: "Trail Blazers", conference: "West", color: "#E03A3E", prevWins: 36, wins: 21, losses: 27 },
  { id: "SAC", nbaId: 1610612758, city: "Sacramento", name: "Kings", conference: "West", color: "#5A2D81", prevWins: 40, wins: 16, losses: 32 },
  { id: "SAS", nbaId: 1610612759, city: "San Antonio", name: "Spurs", conference: "West", color: "#4B5257", prevWins: 34, wins: 31, losses: 17 },
  { id: "UTA", nbaId: 1610612762, city: "Utah", name: "Jazz", conference: "West", color: "#753BBD", prevWins: 17, wins: 14, losses: 34 },
];

export const TEAM_IDS: ReadonlySet<TeamId> = new Set(TEAM_INFO.map((team) => team.id));

/** Every team has a separately draftable Over and Under. */
export const TOTAL_SIDES = TEAM_INFO.length * 2;

/**
 * Our id for a team named by its nickname ("Trail Blazers") or a full name ending in one ("Los Angeles Clippers").
 * Case-insensitive. Shared by every outside feed (ESPN records, FanDuel lines). Null when nothing matches.
 */
export function teamIdByNickname(name: string): TeamId | null {
  const wanted = name.trim().toLowerCase();
  if (wanted === "") return null;
  const team = TEAM_INFO.find((candidate) => {
    const nickname = candidate.name.toLowerCase();
    return wanted === nickname || wanted.endsWith(` ${nickname}`);
  });
  return team?.id ?? null;
}
