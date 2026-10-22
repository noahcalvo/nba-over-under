import { CHALLENGE } from "@/config/challenge";
import { TEAM_IDS } from "@/data/teams";
import { saveChallengeEntry } from "@/db/challenge";
import { parseChallengeSave } from "@/lib/challenge/picks";
import { getAccount, signedOutError } from "@/server/account";
import { errorResponse, isSameOrigin, readJsonBody } from "@/server/http";
import { prepareChallenge } from "@/server/challenge";

/** Save the signed-in account's entry: `{ displayName, picks: [{ teamId, side }] }` with all 30 teams. Returns `{ entry }`. */
export async function PUT(request: Request) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const account = await getAccount();
  if (!account) return errorResponse(signedOutError());
  const parsed = parseChallengeSave(await readJsonBody(request), TEAM_IDS);
  if (!parsed.ok) return errorResponse(parsed.error);
  const { db, current } = await prepareChallenge();
  const result = await saveChallengeEntry(db, {
    season: CHALLENGE.seasonYear,
    userId: account.userId,
    displayName: parsed.displayName,
    picks: parsed.picks,
    currentLines: current.values,
  });
  return result.ok ? Response.json({ entry: result.value }) : errorResponse(result.error);
}
