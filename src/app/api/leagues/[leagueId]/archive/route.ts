import { archiveLeague } from "@/db/actions";
import { getAccount, signedOutError } from "@/server/account";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin, readJsonBody } from "@/server/http";

/** Archive the league: `{ confirmName: "<the league's name>" }`. Commissioner only; it cannot be undone from the app. */
export async function POST(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/archive">) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const account = await getAccount();
  if (!account) return errorResponse(signedOutError());
  const { leagueId } = await ctx.params;
  const body = await readJsonBody(request);
  const confirmName = body !== null && typeof body === "object" ? (body as { confirmName?: unknown }).confirmName : undefined;
  const result = await archiveLeague(await getDb(), leagueId, account.userId, confirmName);
  if (!result.ok) return errorResponse(result.error);
  return Response.json({ ok: true });
}
