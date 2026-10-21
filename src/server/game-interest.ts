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
import { getLegacySession } from "@/server/session";

export interface PlayerStakes {
  leagues: InterestLeague[];
  challenge: ChallengeStakeInput | null;
  /** Every league the viewer sits in for the schedule's season, whether or not it loaded. */
  seated: { id: string; name: string }[];
  /** True when the seats, a seated league or the challenge entry could not be loaded: what is here may be incomplete. */
  failed: boolean;
}

const empty = (): PlayerStakes => ({ leagues: [], challenge: null, seated: [], failed: false });

/** The viewer's entry for the schedule's season; `failed` when the read threw (as opposed to no entry). */
async function loadChallengeStake(): Promise<{ stake: ChallengeStakeInput | null; failed: boolean }> {
  if (CHALLENGE.seasonYear !== seasonEndYear(NBA_SCHEDULE.season)) return { stake: null, failed: false };
  try {
    const db = await getDb();
    const entry = await getViewerEntry(db);
    if (!entry) return { stake: null, failed: false };
    const season = await loadChallengeSeason(db, CHALLENGE.seasonYear);
    return { stake: { entry, frozen: season?.frozen ?? null }, failed: false };
  } catch (error) {
    console.error("Challenge stake load failed", error);
    return { stake: null, failed: true };
  }
}

/**
 * What this browser has riding on NBA games: its seats in leagues of the schedule's season and its 30/30 Challenge
 * entry. Read-only (never prepares the challenge: no schedule sync, freeze or line read). Without a session nothing is
 * loaded and the database is not touched. A league or the challenge that fails to load is skipped and sets `failed`.
 */
export const loadPlayerStakes = cache(async (): Promise<PlayerStakes> => {
  if (!(await getLegacySession())) return empty();
  let seatedLeagues;
  try {
    seatedLeagues = (await listViewerLeagues()).filter((seat) => seat.seasonLabel === NBA_SCHEDULE.season);
  } catch (error) {
    console.error("Seated leagues load failed", error);
    const { stake } = await loadChallengeStake();
    return { ...empty(), challenge: stake, failed: true };
  }
  const [loaded, { stake: challenge, failed: challengeFailed }] = await Promise.all([
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
  const leagues = loaded.filter((entry): entry is InterestLeague => entry !== null);
  return {
    leagues,
    challenge,
    seated: seatedLeagues.map((seat) => ({ id: seat.id, name: seat.name })),
    failed: challengeFailed || leagues.length < seatedLeagues.length,
  };
});
