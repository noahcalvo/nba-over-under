import { refreshLeagueRecords } from "@/db/actions";
import { getAccount, signedOutError } from "@/server/account";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin } from "@/server/http";
import { recordSource } from "@/server/records";

/** Commissioner: refresh team records for this league's season. */
export async function POST(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/records/refresh">) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const account = await getAccount();
  if (!account) return errorResponse(signedOutError());
  const { leagueId } = await ctx.params;
  const result = await refreshLeagueRecords(await getDb(), leagueId, account.userId, recordSource);
  if (!result.ok) return errorResponse(result.error);
  const { value } = result;
  if (!value.ok) {
    return Response.json(
      {
        error: "records_unavailable",
        message: value.message,
        records: value.status,
      },
      { status: 502 },
    );
  }
  return Response.json({ ok: true, records: value.status });
}
