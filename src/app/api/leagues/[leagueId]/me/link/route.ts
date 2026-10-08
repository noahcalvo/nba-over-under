import { resetOwnLink } from "@/db/actions";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin, readJsonBody, resultResponse } from "@/server/http";
import { getSession } from "@/server/session";

/** Replace the viewer's personal link; `{ signOutOtherDevices: true }` also signs out their other browsers. */
export async function POST(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/me/link">) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const { leagueId } = await ctx.params;
  const body = await readJsonBody(request);
  const session = await getSession();
  return resultResponse(
    await resetOwnLink(await getDb(), leagueId, session?.id ?? null, {
      signOutOtherDevices: body.signOutOtherDevices === true,
    }),
  );
}
