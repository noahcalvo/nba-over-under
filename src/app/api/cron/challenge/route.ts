import { refreshChallenge } from "@/server/challenge";
import { cronRejection } from "@/server/cron";

/** Daily (vercel.json): re-read the schedule, record FanDuel's lines, and freeze the challenge once its deadline passed. */
export async function GET(request: Request) {
  const rejection = cronRejection(request);
  if (rejection) return rejection;
  const { season, phase, current } = await refreshChallenge();
  return Response.json({
    phase,
    deadline: season?.deadline ?? null,
    scheduleError: season?.scheduleError ?? null,
    linesAsOf: current.asOf,
    linesError: current.error,
    frozen: season?.frozen ? { lockedAt: season.frozen.lockedAt, missing: season.frozen.missing } : null,
  });
}
