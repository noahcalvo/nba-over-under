import { createLeagueFor } from "@/db/actions";
import { getAccount, signedOutError } from "@/server/account";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin, readJsonBody } from "@/server/http";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const account = await getAccount();
  if (!account) return errorResponse(signedOutError());
  const body = await readJsonBody(request);
  const result = await createLeagueFor(await getDb(), account.userId, {
    leagueName: body.leagueName,
    displayName: body.displayName,
  });
  if (!result.ok) return errorResponse(result.error);
  return Response.json({ leagueId: result.value.leagueId }, { status: 201 });
}
