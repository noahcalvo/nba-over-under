import { withSeat } from "@/lib/league/seats-cookie";
import { errorResponse, readJsonBody } from "@/server/http";
import { leagueStore } from "@/server/store";
import { readSeats, writeSeats } from "@/server/viewer";

export async function POST(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/join">) {
  const { leagueId } = await ctx.params;
  const body = await readJsonBody(request);
  const seats = await readSeats();
  const result = leagueStore.join(leagueId, {
    managerId: body.managerId,
    displayName: body.displayName,
    currentManagerId: seats[leagueId] ?? null,
  });
  if (!result.ok) return errorResponse(result.error);
  const { managerId } = result.value;
  await writeSeats(withSeat(seats, leagueId, managerId));
  return Response.json({ leagueId, managerId });
}
