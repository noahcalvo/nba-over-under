import { CHALLENGE } from "@/config/challenge";
import { refreshSeasonRecords, seasonsInUse } from "@/db/records";
import { seasonEndYear } from "@/lib/records/season";
import { cronRejection } from "@/server/cron";
import { getDb } from "@/server/db";
import { recordSource } from "@/server/records";

/** Daily (vercel.json): refresh records for every season a stored league plays in and the 30/30 Challenge's. Vercel sends CRON_SECRET. */
export async function GET(request: Request) {
  const rejection = cronRejection(request);
  if (rejection) return rejection;
  const db = await getDb();
  const results: { season: string; ok: boolean; message?: string }[] = [];
  for (const label of new Set([...(await seasonsInUse(db)), CHALLENGE.season])) {
    const season = seasonEndYear(label);
    if (season === null) {
      results.push({ season: label, ok: false, message: "Unrecognized season label." });
      continue;
    }
    const outcome = await refreshSeasonRecords(db, season, recordSource, { force: true });
    results.push(outcome.ok ? { season: label, ok: true } : { season: label, ok: false, message: outcome.message });
  }
  return Response.json({ results }, { status: results.every((result) => result.ok) ? 200 : 502 });
}
