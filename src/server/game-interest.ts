import "server-only";
import { cache } from "react";
import { CHALLENGE } from "@/config/challenge";
import { NBA_SCHEDULE } from "@/config/schedule";
import { loadChallengeSeason } from "@/db/challenge";
import type { ChallengeStakeInput, InterestLeague } from "@/lib/nba-schedule/interest";
import { seasonEndYear } from "@/lib/records/season";
import { getViewerEntry } from "@/server/challenge";
import { getDb } from "@/server/db";
import { findLeague, listViewerLeagues } from "@/server/league";
import { getSession } from "@/server/session";

export interface PlayerStakes {
  leagues: InterestLeague[];
  challenge: ChallengeStakeInput | null;
  /** Every league the viewer sits in for the schedule's season, whether or not it loaded. */
  seated: { id: string; name: string }[];
}

const empty = (): PlayerStakes => ({ leagues: [], challenge: null, seated: [] });

async function loadChallengeStake(): Promise<ChallengeStakeInput | null> {
  if (CHALLENGE.seasonYear !== seasonEndYear(NBA_SCHEDULE.season)) return null;
  try {
    const db = await getDb();
    const entry = await getViewerEntry(db);
    if (!entry) return null;
    const season = await loadChallengeSeason(db, CHALLENGE.seasonYear);
    return { entry, frozen: season?.frozen ?? null };
  } catch (error) {
    console.error("Challenge stake load failed", error);
    return null;
  }
}

/**
 * What this browser has riding on NBA games: its seats in leagues of the schedule's season and its 30/30 Challenge
 * entry. Read-only (never prepares the challenge: no schedule sync, freeze or line read). Without a session nothing is
 * loaded and the database is not touched. A league or the challenge that fails to load is skipped.
 */
export const loadPlayerStakes = cache(async (): Promise<PlayerStakes> => {
  if (!(await getSession())) return empty();
  let seatedLeagues;
  try {
    seatedLeagues = (await listViewerLeagues()).filter((seat) => seat.seasonLabel === NBA_SCHEDULE.season);
  } catch (error) {
    console.error("Seated leagues load failed", error);
    return { ...empty(), challenge: await loadChallengeStake() };
  }
  const [loaded, challenge] = await Promise.all([
    Promise.all(
      seatedLeagues.map(async (seat): Promise<InterestLeague | null> => {
        try {
          const league = await findLeague(seat.id);
          return league ? { league, viewerId: seat.manager.id } : null;
        } catch (error) {
          console.error(`League ${seat.id} load failed`, error);
          return null;
        }
      }),
    ),
    loadChallengeStake(),
  ]);
  return {
    leagues: loaded.filter((entry): entry is InterestLeague => entry !== null),
    challenge,
    seated: seatedLeagues.map((seat) => ({ id: seat.id, name: seat.name })),
  };
});
