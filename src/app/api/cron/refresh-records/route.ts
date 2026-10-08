import { timingSafeEqual } from "node:crypto";
import { refreshSeasonRecords, seasonsInUse } from "@/db/records";
import { seasonEndYear } from "@/lib/records/season";
import { getDb } from "@/server/db";
import { recordSource } from "@/server/records";

function authorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Daily (vercel.json): refresh records for every season a stored league plays in. Vercel sends CRON_SECRET. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set." }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  const results: { season: string; ok: boolean; message?: string }[] = [];
  for (const label of await seasonsInUse(db)) {
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
