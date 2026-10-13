import { CHALLENGE } from "@/config/challenge";
import { TEAM_IDS } from "@/data/teams";
import { saveChallengeEntry } from "@/db/challenge";
import { parseChallengeSave } from "@/lib/challenge/picks";
import { errorResponse, isSameOrigin, readJsonBody } from "@/server/http";
import { prepareChallenge } from "@/server/challenge";
import { ensureSession } from "@/server/session";

/** Save this browser's entry: `{ displayName, picks: [{ teamId, side }] }` with all 30 teams. Returns `{ entry }`. */
export async function PUT(request: Request) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const parsed = parseChallengeSave(await readJsonBody(request), TEAM_IDS);
  if (!parsed.ok) return errorResponse(parsed.error);
  const sessionId = await ensureSession();
  const { db, current } = await prepareChallenge();
  const result = await saveChallengeEntry(db, {
    season: CHALLENGE.seasonYear,
    sessionId,
    displayName: parsed.displayName,
    picks: parsed.picks,
    currentLines: current.values,
  });
  return result.ok ? Response.json({ entry: result.value }) : errorResponse(result.error);
}
