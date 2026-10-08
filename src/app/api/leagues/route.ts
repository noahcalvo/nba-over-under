import { withSeat } from "@/lib/league/seats-cookie";
import { errorResponse, readJsonBody } from "@/server/http";
import { leagueStore } from "@/server/store";
import { readSeats, writeSeats } from "@/server/viewer";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  const result = leagueStore.create({ leagueName: body.leagueName, displayName: body.displayName });
  if (!result.ok) return errorResponse(result.error);
  const { league, managerId } = result.value;
  await writeSeats(withSeat(await readSeats(), league.id, managerId));
  return Response.json({ leagueId: league.id, managerId }, { status: 201 });
}
