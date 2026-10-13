import type { OpeningGame } from "@/lib/challenge/types";

/**
 * The opening game the mock dataset uses (RECORD_SOURCE=static), since the mock game logs have no dates.
 * CHALLENGE_MOCK_TIPOFF (an ISO time) overrides it to try the locked states locally.
 */
export const MOCK_OPENING_GAME: OpeningGame = { tipoff: "2026-10-20T23:30:00.000Z", teams: ["BOS", "NYK"] };
